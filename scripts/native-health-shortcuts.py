#!/usr/bin/env python3
"""Package sanitized, user-tested native Health actions as installable templates.

The fixtures contain no credentials or Health readings. Only generic workflow
bytes are sent to the signing service; installation supplies private JSON locally.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import plistlib
import sys
from urllib.parse import quote
import urllib.request

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / "scripts" / "shortcut-templates"
OUTPUT = ROOT / "public" / "shortcuts"
KINDS = ("berat", "watch")
SPEC = importlib.util.spec_from_file_location("health_wire", Path(__file__).with_name("health-shortcut.py"))
wire = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(wire)


def native(kind):
    assert kind in KINDS
    return plistlib.loads((TEMPLATES / f"slothly-{kind}.native.plist").read_bytes())


def native_ref(action, name):
    return wire.attachment({"Type": "ActionOutput", "OutputUUID": action["WFWorkflowActionParameters"]["UUID"], "OutputName": name})


def post_field(params):
    items = params["WFJSONValues"]["Value"]["WFDictionaryFieldValueItems"]
    return next(item for item in items if item["WFKey"]["Value"]["string"] != "provider")


def gate_unit(flow, kind, metric, found):
    """Reject unsupported units before posting any affected numeric value."""
    rules = {
        "weightKg": (r"(?i)^(kg|kilogram|kilograms)$", "kg"),
        "bodyFatPercent": (r"(?i)^(%|percent|percentage)$", "%"),
        "restingHeartRate": (r"(?i)^(count/min|bpm|beats/min|beats/minute)$", "BPM"),
        "vo2Max": (r"(?i)^(ml/\(kg\*min\)|ml/kg/min|ml/\(kg[.·]min\))$", "mL/kg/min"),
        # Energy can contain many samples: every unit line must be recognized.
        "calories": (r"(?i)^(?:kcal|kilocalories?)(?:\n(?:kcal|kilocalories?))*$", "kcal"),
    }
    pattern, expected = rules[metric]
    label = f"{kind}-{metric}-unit"
    unit = flow.add("properties.health.quantity", label, WFInput=native_ref(found, "Health Samples"),
                    WFContentItemPropertyName="Unit")
    if metric == "calories":
        unit = flow.add("text.combine", label + "-lines", text=unit, WFTextSeparator="New Lines")
    matched = flow.add("text.match", label + "-recognized", text=wire.text(unit),
                       WFMatchTextPattern=pattern, WFMatchTextCaseSensitive=False)
    flow.begin(label + "-unsupported", matched, 101)
    flow.add("alert", label + "-alert", WFAlertActionTitle="Slothly " + kind.title(),
             WFAlertActionMessage=wire.text("Satuan data ini belum didukung. Gunakan ", expected,
                 " di Apple Health, lalu coba lagi. Pengukuran dengan satuan ini belum dikirim ke Slothly."),
             WFAlertActionCancelButtonShown=False)
    flow.add("exit", label + "-stop")
    flow.end(label + "-unsupported")


def build(kind):
    workflow = copy.deepcopy(native(kind))
    source = workflow.pop("WFWorkflowActions")
    name = "Slothly " + kind.title()
    flow = wire.Workflow()
    details = ("Membaca berat dan persentase lemak yang tersedia hari ini dari Apple Health. "
               "Untuk otomatisasi setelah menimbang, pilih aplikasi timbangan digital milikmu saat ditutup.") if kind == "berat" else (
               "Membaca denyut istirahat, VO2 max, dan jumlah energi aktif hari ini yang tersedia di Apple Health. "
               "Otomatisasi opsional: setiap hari pukul 21.30.")
    flow.add("comment", kind + "-intro", WFCommentActionText=name + " v1. " + details +
             " Tempel konfigurasi JSON pribadi dari Slothly saat memasang. Jangan bagikan konfigurasi atau Shortcut yang sudah diisi. Tidak menulis ke Apple Health.")
    config_index = len(flow.actions)
    config = flow.add("gettext", kind + "-configuration", WFTextActionText="{}")
    flow.config(kind + "-config", config)
    latest_find = None
    for index, original in enumerate(source):
        action = copy.deepcopy(original)
        ident, params = action["WFWorkflowActionIdentifier"], action["WFWorkflowActionParameters"]
        if ident.endswith(".filter.health.quantity"):
            # A Find action can otherwise search the preceding action's input
            # instead of all Health data. Keep the native predicate unchanged.
            flow.add("nothing", f"{kind}-clear-{index}")
            latest_find = action
        if ident.endswith(".downloadurl"):
            item = post_field(params)
            metric = item["WFKey"]["Value"]["string"]
            metric = "vo2Max" if metric == "vo2max" else metric
            value = copy.deepcopy(item["WFValue"])
            assert latest_find is not None
            gate_unit(flow, kind, metric, latest_find)
            if metric == "calories":
                # Native operator 1002 means Today. The stale Number/Unit
                # predicate fields are deliberately retained in the fixture.
                body = wire.dictionary([wire.field("calories", 3, value),
                                        wire.field("provider", 0, wire.text("apple_health"))])
            else:
                date = flow.add("properties.health.quantity", f"{kind}-{metric}-date",
                                WFInput=native_ref(latest_find, "Health Samples"), WFContentItemPropertyName="Start Date")
                iso = flow.add("format.date", f"{kind}-{metric}-iso", WFDate=wire.text(date),
                               WFDateFormatStyle="ISO 8601", WFISO8601IncludeTime=True)
                body = wire.dictionary([
                    wire.field("provider", 0, wire.text("apple_health")),
                    wire.field("samples", 2, {"Value": [wire.dictionary_item([
                        wire.field("metric", 0, wire.text(metric)),
                        wire.field("value", 3, value),
                        wire.field("measuredAt", 0, wire.text(iso)),
                    ])], "WFSerializationType": "WFArrayParameterState"}),
                ])
            params.update(WFURL=wire.text(wire.variable("Endpoint")), WFHTTPMethod="POST", WFHTTPBodyType="JSON",
                          WFJSONValues=body, WFHTTPHeaders=wire.dictionary([
                              wire.field("Authorization", 0, wire.text("Bearer ", wire.variable("Token"))),
                              wire.field("Content-Type", 0, wire.text("application/json")),
                              wire.field("Accept", 0, wire.text("application/json")),
                          ]))
            flow.actions.append(action)
            response = native_ref(action, "Contents of URL")
            status = flow.key(f"{kind}-{metric}-status", "status", response)
            label = f"{kind}-{metric}-failed"
            flow.begin(label, status, 5, WFConditionalActionString="ok")
            flow.add("alert", label + "-alert", WFAlertActionTitle=name,
                     WFAlertActionMessage=wire.text("Data belum tersimpan. Periksa koneksi internet. Jika masih gagal, pasang ulang Shortcut dengan konfigurasi terbaru dari Slothly → Profil → Data kesehatan."),
                     WFAlertActionCancelButtonShown=False)
            flow.add("exit", label + "-stop")
            flow.end(label)
        else:
            flow.actions.append(action)
    workflow.update(WFWorkflowName=name, WFWorkflowInputContentItemClasses=[],
                    WFWorkflowOutputContentItemClasses=[], WFWorkflowHasShortcutInputVariables=False,
                    WFWorkflowImportQuestions=[{"ParameterKey": "WFTextActionText", "Category": "Parameter",
                        "ActionIndex": config_index, "Text": "Tempel konfigurasi JSON pribadi dari Slothly → Profil → Data kesehatan. Jangan bagikan konfigurasi ini.", "DefaultValue": "{}"}],
                    WFWorkflowActions=flow.actions)
    return workflow


def validate(workflow, kind):
    actions = workflow["WFWorkflowActions"]
    assert len(actions) < 80, "Keep the automation workflow small"
    assert workflow["WFWorkflowInputContentItemClasses"] == []
    questions = workflow["WFWorkflowImportQuestions"]
    assert len(questions) == 1 and questions[0]["ParameterKey"] == "WFTextActionText"
    config = actions[questions[0]["ActionIndex"]]
    assert config["WFWorkflowActionIdentifier"].endswith(".gettext")
    assert config["WFWorkflowActionParameters"]["WFTextActionText"] == "{}"
    allowed = {"comment", "gettext", "detect.dictionary", "getvalueforkey", "setvariable", "text.match", "text.combine",
               "conditional", "alert", "exit", "nothing", "filter.health.quantity", "count",
               "properties.health.quantity", "format.date", "downloadurl", "statistics"}
    seen, stack = set(), []

    def refs(value):
        if isinstance(value, dict):
            if "OutputUUID" in value:
                assert value["OutputUUID"] in seen, "Forward or missing output reference"
            if value.get("WFSerializationType") == "WFTextTokenString":
                encoded = value["Value"]["string"].encode("utf-16-le")
                attachments = value["Value"].get("attachmentsByRange", {})
                assert encoded.count(b"\xfc\xff") == len(attachments)
                for key in attachments:
                    offset = int(key.split(",")[0][1:]) * 2
                    assert encoded[offset:offset + 2] == b"\xfc\xff"
            for child in value.values():
                refs(child)
        elif isinstance(value, list):
            for child in value:
                refs(child)
        elif isinstance(value, str):
            assert "slothly.u1." not in value and "slothly.u2." not in value, "Embedded credential"
            assert "Bearer" not in value or value in ("Bearer ", "Bearer \ufffc"), "Embedded Bearer value"

    preserved = []
    for index, action in enumerate(actions):
        ident, params = action["WFWorkflowActionIdentifier"], action["WFWorkflowActionParameters"]
        kind_name = ident.removeprefix("is.workflow.actions.")
        assert kind_name in allowed, "No clipboard, files, selection prompt, or Health write actions"
        refs(params)
        if kind_name == "conditional":
            mode, group = params["WFControlFlowMode"], params["GroupingIdentifier"]
            if mode == 0:
                stack.append(group)
            else:
                assert stack and stack[-1] == group, "Mismatched conditional"
                if mode == 2:
                    stack.pop()
        if kind_name == "filter.health.quantity":
            assert actions[index - 1]["WFWorkflowActionIdentifier"].endswith(".nothing")
        if kind_name in {"filter.health.quantity", "count", "conditional", "properties.health.quantity", "statistics"}:
            preserved.append(action)
        if "UUID" in params:
            assert params["UUID"] not in seen, "Duplicate action UUID"
            seen.add(params["UUID"])
        if kind_name == "downloadurl":
            headers = params["WFHTTPHeaders"]["Value"]["WFDictionaryFieldValueItems"]
            keys = [item["WFKey"]["Value"]["string"] for item in headers]
            assert keys == ["Authorization", "Content-Type", "Accept"]
            assert headers[0]["WFValue"] == wire.text("Bearer ", wire.variable("Token"))
            assert params["WFURL"] == wire.text(wire.variable("Endpoint"))
    assert not stack
    # Native branches/queries and numeric extraction remain byte-for-byte equal.
    native_actions = native(kind)["WFWorkflowActions"]
    expected = [a for a in native_actions if not a["WFWorkflowActionIdentifier"].endswith(".downloadurl")]
    for action in expected:
        assert action in preserved, "Changed native query, extraction, count, or branch"
    assert sum(a["WFWorkflowActionIdentifier"].endswith(".downloadurl") for a in actions) == (2 if kind == "berat" else 3)
    assert sum(a["WFWorkflowActionIdentifier"].endswith(".filter.health.quantity") for a in actions) == (2 if kind == "berat" else 3)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_hash():
    return sha(Path(__file__).read_bytes().replace(b"\r\n", b"\n"))


def download_filename(kind):
    assert kind in KINDS
    # iPhone may derive the installed name from the downloaded basename even
    # when WFWorkflowName is present. Keep the physical public filename exact.
    return "Slothly " + kind.title() + ".shortcut"


def install_path(kind):
    return "/shortcuts/" + quote(download_filename(kind))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sign", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--signing-server", default="https://sign.shortcuty.app/api/v1/sign")
    args = parser.parse_args()
    manifest_path = OUTPUT / "native-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if args.check else {
        "version": 1, "generatorSha256": source_hash(), "wireHelpersSha256": sha(Path(wire.__file__).read_bytes().replace(b"\r\n", b"\n")),
        "signingFormat": "AEA1", "signingMode": "anyone", "signingService": args.signing_server,
        "deviceVerification": "Native query actions supplied and tested by user; generic installer and automation pending physical iPhone validation",
        "shortcuts": {}}
    for kind in KINDS:
        workflow = build(kind)
        validate(workflow, kind)
        unsigned = plistlib.dumps(workflow, fmt=plistlib.FMT_XML, sort_keys=False)
        stem = "slothly-" + kind
        unsigned_path, signed_path = OUTPUT / (stem + ".unsigned.plist"), OUTPUT / download_filename(kind)
        fixture_hash = sha((TEMPLATES / (stem + ".native.plist")).read_bytes().replace(b"\r\n", b"\n"))
        if args.check:
            record = manifest["shortcuts"][kind]
            assert unsigned_path.read_bytes().replace(b"\r\n", b"\n") == unsigned
            signed = signed_path.read_bytes()
            assert signed.startswith(b"AEA1")
            assert record["unsignedSha256"] == sha(unsigned) and record["signedSha256"] == sha(signed)
            assert record["fixtureSha256"] == fixture_hash
            assert record["installPath"] == install_path(kind)
            assert signed_path.name == workflow["WFWorkflowName"] + ".shortcut"
            assert not (OUTPUT / (stem + ".shortcut")).exists(), "Do not publish alternate installed names"
            print(f"Verified {workflow['WFWorkflowName']}: {len(workflow['WFWorkflowActions'])} actions; AEA1 and hashes match.")
            continue
        OUTPUT.mkdir(parents=True, exist_ok=True)
        unsigned_path.write_bytes(unsigned)
        print(f"Built generic {workflow['WFWorkflowName']}: {len(workflow['WFWorkflowActions'])} actions.")
        if not args.sign:
            continue
        assert args.signing_server.startswith("https://")
        request = urllib.request.Request(args.signing_server, data=unsigned, method="POST", headers={
            "Content-Type": "application/octet-stream", "X-Filename": workflow["WFWorkflowName"] + ".shortcut",
            "User-Agent": "Slothly-Native-Shortcut-Builder/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            signed = response.read()
            reported = response.headers.get("X-Shortcut-Input-SHA256")
        assert signed.startswith(b"AEA1"), "Signing service did not return an Apple Archive"
        if reported:
            assert reported == sha(unsigned), "Signing service signed different bytes"
        signed_path.write_bytes(signed)
        manifest["shortcuts"][kind] = {"name": workflow["WFWorkflowName"], "actions": len(workflow["WFWorkflowActions"]),
            "installPath": install_path(kind), "fixtureSha256": fixture_hash,
            "unsignedSha256": sha(unsigned), "signedSha256": sha(signed)}
        print(f"Signed generic {workflow['WFWorkflowName']} ({len(signed)} bytes); no private configuration uploaded.")
    if args.check:
        assert manifest["generatorSha256"] == source_hash()
        assert manifest["wireHelpersSha256"] == sha(Path(wire.__file__).read_bytes().replace(b"\r\n", b"\n"))
    elif args.sign:
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
