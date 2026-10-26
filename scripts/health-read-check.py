#!/usr/bin/env python3
"""Build a local-only Weight read diagnostic, separate from Health sync."""
import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "shortcuts"
STEM = "slothly-health-read-check"
NAME = "Slothly Health Read Check"
NAMESPACE = uuid.UUID("6d3dc098-5664-449b-bb70-106a942bb817")


def uid(label):
    return str(uuid.uuid5(NAMESPACE, label)).upper()


def ref(label, name):
    return {"Value": {"Type": "ActionOutput", "OutputUUID": uid(label), "OutputName": name},
            "WFSerializationType": "WFTextTokenAttachment"}


def text(*parts):
    value, attachments = "", {}
    for part in parts:
        if isinstance(part, dict):
            offset = len(value.encode("utf-16-le")) // 2
            attachments[f"{{{offset}, 1}}"] = part["Value"]
            value += "\ufffc"
        else:
            value += str(part)
    state = {"string": value}
    if attachments:
        state["attachmentsByRange"] = attachments
    return {"Value": state, "WFSerializationType": "WFTextTokenString"}


def build():
    actions = []

    def add(kind, label, **params):
        actions.append({"WFWorkflowActionIdentifier": "is.workflow.actions." + kind,
                        "WFWorkflowActionParameters": {"UUID": uid(label), **params}})

    add("comment", "intro", WFCommentActionText="Slothly Health Read Check v1. Pemeriksaan lokal: hanya mencari satu sampel Weight terbaru dan menampilkan jumlah serta tanggalnya. Tidak membaca nilai berat, tidak mengirim data, tidak membaca konfigurasi atau clipboard, dan tidak menyimpan berkas. Ini alat diagnosis, bukan sinkronisasi.")
    add("nothing", "clear-input")
    add("filter.health.quantity", "find-weight", WFContentItemFilter={
        "Value": {"WFActionParameterFilterPrefix": 1, "WFContentPredicateBoundedDate": False,
                  "WFActionParameterFilterTemplates": [{"Bounded": True, "Operator": 4,
                      "Property": "Type", "Removable": False, "Values": {"Enumeration": {
                          "Value": "Weight", "WFSerializationType": "WFStringSubstitutableState"}}}]},
        "WFSerializationType": "WFContentPredicateTableTemplate"},
        WFContentItemSortProperty="Start Date", WFContentItemSortOrder="Latest First",
        WFContentItemLimitEnabled=True, WFContentItemLimitNumber=1)
    # Actual exported Count uses capital-I Input, NOT WFInput or text.
    add("count", "count-weight", Input=ref("find-weight", "Health Samples"), WFCountType="Items")
    add("conditional", "has-weight", GroupingIdentifier=uid("result-branch"), WFControlFlowMode=0,
        WFCondition=2, WFNumberValue="0", WFInput={"Type": "Variable", "Variable": ref("count-weight", "Count")})
    add("properties.health.quantity", "weight-date", WFInput=ref("find-weight", "Health Samples"), WFContentItemPropertyName="Start Date")
    add("format.date", "date-iso", WFDate=text(ref("weight-date", "Start Date")),
        WFDateFormatStyle="ISO 8601", WFISO8601IncludeTime=True)
    add("alert", "readable-result", WFAlertActionTitle=NAME,
        WFAlertActionMessage=text("Jumlah sampel Weight yang terbaca: ", ref("count-weight", "Count"),
            "\nTanggal pengukuran terbaru: ", ref("date-iso", "Formatted Date"),
            "\n\nHasil ini hanya tampil di iPhone. Belum ada data yang dikirim ke Slothly. Bandingkan tanggalnya dengan catatan Weight di Health."),
        WFAlertActionCancelButtonShown=False)
    add("conditional", "otherwise", GroupingIdentifier=uid("result-branch"), WFControlFlowMode=1)
    add("alert", "empty-result", WFAlertActionTitle=NAME,
        WFAlertActionMessage=text("Jumlah sampel Weight yang terbaca: 0.\n\nQuery tidak mengembalikan sampel yang dapat dibaca. Penyebabnya belum diketahui; hasil ini tidak memastikan apakah izin ditolak atau data tidak tersedia. Tidak ada data yang dikirim ke Slothly."),
        WFAlertActionCancelButtonShown=False)
    add("conditional", "end-result", GroupingIdentifier=uid("result-branch"), WFControlFlowMode=2)
    return {"WFWorkflowName": NAME, "WFWorkflowClientVersion": "3107.0.8.2", "WFWorkflowClientRelease": "22.1",
            "WFWorkflowMinimumClientVersion": 900, "WFWorkflowMinimumClientVersionString": "900",
            "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4292093695, "WFWorkflowIconGlyphNumber": 59511},
            "WFWorkflowTypes": ["NCWidget"], "WFWorkflowInputContentItemClasses": [],
            "WFWorkflowOutputContentItemClasses": [], "WFWorkflowImportQuestions": [],
            "WFWorkflowActions": actions}


def validate(workflow):
    allowed = {"comment", "nothing", "filter.health.quantity", "count", "conditional",
               "properties.health.quantity", "format.date", "alert"}
    seen, stack = set(), []

    def check_refs(value):
        if isinstance(value, dict):
            if "OutputUUID" in value:
                assert value["OutputUUID"] in seen, "Forward or unknown output"
            for child in value.values():
                check_refs(child)
        elif isinstance(value, list):
            for child in value:
                check_refs(child)

    actions = workflow["WFWorkflowActions"]
    assert len(actions) == 11
    for index, action in enumerate(actions):
        kind = action["WFWorkflowActionIdentifier"].removeprefix("is.workflow.actions.")
        assert kind in allowed, "Diagnostic may not perform network, file, clipboard, or Health writes"
        params = action["WFWorkflowActionParameters"]
        check_refs(params)
        if kind == "filter.health.quantity":
            assert index == 2 and actions[index - 1]["WFWorkflowActionIdentifier"] == "is.workflow.actions.nothing"
            assert params["WFContentItemFilter"]["Value"]["WFActionParameterFilterTemplates"][0]["Values"]["Enumeration"]["Value"] == "Weight"
        if kind == "count":
            assert "Input" in params and "WFInput" not in params and params["WFCountType"] == "Items"
        if kind == "properties.health.quantity":
            assert params["WFContentItemPropertyName"] == "Start Date", "Do not read measurement values"
        if kind == "conditional":
            if params["WFControlFlowMode"] == 0:
                stack.append(params["GroupingIdentifier"])
            else:
                assert stack[-1] == params["GroupingIdentifier"]
                if params["WFControlFlowMode"] == 2:
                    stack.pop()
        assert params["UUID"] not in seen
        seen.add(params["UUID"])
    assert not stack


def sha(value):
    return hashlib.sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sign", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    workflow = build()
    validate(workflow)
    unsigned = plistlib.dumps(workflow, fmt=plistlib.FMT_XML, sort_keys=False)
    unsigned_path = OUTPUT / (STEM + ".unsigned.plist")
    signed_path = OUTPUT / (STEM + ".shortcut")
    manifest_path = OUTPUT / "read-check-manifest.json"
    source_hash = sha(Path(__file__).read_bytes().replace(b"\r\n", b"\n"))
    if args.check:
        assert unsigned_path.read_bytes().replace(b"\r\n", b"\n") == unsigned
        signed = signed_path.read_bytes()
        assert signed.startswith(b"AEA1")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert manifest["unsignedSha256"] == sha(unsigned)
        assert manifest["signedSha256"] == sha(signed)
        assert manifest["generatorSha256"] == source_hash
        print("Verified local-only 11-action diagnostic; AEA1 and hashes match.")
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    unsigned_path.write_bytes(unsigned)
    print("Built local-only 11-action Weight diagnostic.")
    if not args.sign:
        return
    signing_server = "https://sign.shortcuty.app/api/v1/sign"
    request = urllib.request.Request(signing_server, data=unsigned, method="POST", headers={
        "Content-Type": "application/octet-stream", "X-Filename": NAME + ".shortcut",
        "User-Agent": "Slothly-Health-Read-Check-Builder/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        signed = response.read()
        reported = response.headers.get("X-Shortcut-Input-SHA256")
    assert signed.startswith(b"AEA1")
    if reported:
        assert reported == sha(unsigned)
    signed_path.write_bytes(signed)
    manifest_path.write_text(json.dumps({"name": NAME, "version": 1, "actions": 11,
        "installPath": "/shortcuts/" + STEM + ".shortcut", "signingFormat": "AEA1",
        "signingMode": "anyone", "signingService": signing_server,
        "unsignedSha256": sha(unsigned), "signedSha256": sha(signed), "generatorSha256": source_hash,
        "deviceVerification": "Pending physical iPhone Weight read count/date validation"}, indent=2) + "\n", encoding="utf-8")
    print(f"Signed generic diagnostic ({len(signed)} bytes); no configuration or health data uploaded.")


if __name__ == "__main__":
    main()
