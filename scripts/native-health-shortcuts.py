#!/usr/bin/env python3
"""Package sanitized, user-tested native Health actions as installable templates.

The fixtures contain no credentials or Health readings. Only generic workflow
bytes are sent to the signing service. A one-use pairing code retrieves private
configuration directly from Slothly after installation, never from the signer.
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
PRODUCTION_ORIGIN = "https://menuju-kurus.vercel.app"
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


def require_status(flow, label, response, expected, message):
    status = flow.key(label + "-status", "status", response)
    flow.begin(label + "-failed", status, 5, WFConditionalActionString=expected)
    flow.add("alert", label + "-alert", WFAlertActionTitle="Slothly",
             WFAlertActionMessage=wire.text(message), WFAlertActionCancelButtonShown=False)
    flow.add("exit", label + "-stop")
    flow.end(label + "-failed")


def require_production_endpoint(flow, label):
    flow.begin(label, wire.variable("Endpoint"), 5,
               WFConditionalActionString=PRODUCTION_ORIGIN + "/api/health-sync")
    flow.stop(label + "-invalid", "Alamat koneksi bukan Slothly yang didukung. Buka menuju-kurus.vercel.app → Profil → Data kesehatan, lalu pilih Hubungkan akun lagi. Belum ada data kesehatan yang dibaca atau dikirim.")
    flow.end(label)


def configure(flow, label, value):
    first = len(flow.actions)
    flow.config(label, value)
    # Retain the established dictionary/validation wire shapes while replacing
    # v5's manual-copy help with the v2 account-pairing instruction.
    for action in flow.actions[first:]:
        if action["WFWorkflowActionIdentifier"].endswith(".alert"):
            action["WFWorkflowActionParameters"].update(WFAlertActionTitle="Slothly",
                WFAlertActionMessage=wire.text("Konfigurasi koneksi belum dapat digunakan. Buka Slothly → Profil → Data kesehatan, lalu pilih Hubungkan akun lagi. Belum ada data kesehatan yang dibaca atau dikirim."))


def bootstrap(flow, kind):
    """Pair once through URL input; both shortcuts reuse the same private file."""
    incoming = wire.attachment({"Type": "ExtensionInput"})
    branch = kind + "-received-pairing"
    flow.begin(branch, incoming)
    parsed = flow.add("detect.dictionary", kind + "-pairing-input", WFInput=incoming)
    flow.set("RedeemURL", flow.key(kind + "-pairing-url", "redeemUrl", parsed), kind + "-set-pairing-url")
    flow.set("PairCode", flow.key(kind + "-pairing-code", "code", parsed), kind + "-set-pairing-code")
    flow.begin(kind + "-pairing-insecure", wire.variable("RedeemURL"), 5,
               WFConditionalActionString=PRODUCTION_ORIGIN + "/api/health-pairing/redeem")
    flow.stop(kind + "-invalid-pairing-url", "Alamat koneksi belum sesuai. Buka Slothly → Profil → Data kesehatan, lalu pilih Hubungkan akun lagi.")
    flow.end(kind + "-pairing-insecure")
    flow.begin(kind + "-missing-code", wire.variable("PairCode"), 101)
    flow.stop(kind + "-pairing-empty", "Kode koneksi belum diterima. Kembali ke Slothly dan pilih Hubungkan akun lagi.")
    flow.end(kind + "-missing-code")
    public_headers = wire.dictionary([
        wire.field("Content-Type", 0, wire.text("application/json")),
        wire.field("Accept", 0, wire.text("application/json")),
    ])
    paired = flow.add("downloadurl", kind + "-redeem", WFURL=wire.text(wire.variable("RedeemURL")),
                      WFHTTPMethod="POST", WFHTTPBodyType="JSON", WFHTTPHeaders=public_headers,
                      WFJSONValues=wire.dictionary([wire.field("code", 0, wire.text(wire.variable("PairCode")))]))
    require_status(flow, kind + "-redeem", paired, "paired",
                   "Koneksi belum tersambung. Kode mungkin sudah digunakan atau kedaluwarsa. Kembali ke Slothly dan pilih Hubungkan akun lagi. Konfigurasi sebelumnya belum diganti.")
    configure(flow, kind + "-new-config", paired)
    require_production_endpoint(flow, kind + "-new-endpoint")
    account = flow.key(kind + "-account-name", "accountName", paired)
    flow.begin(kind + "-account-name-missing", account, 101)
    flow.stop(kind + "-account-unknown", "Nama akun belum diterima. Kembali ke Slothly dan pilih Hubungkan akun lagi. Konfigurasi sebelumnya belum diganti.")
    flow.end(kind + "-account-name-missing")
    flow.add("alert", kind + "-confirm-account", WFAlertActionTitle="Hubungkan Slothly",
             WFAlertActionMessage=wire.text("Hubungkan iPhone ini ke akun ", account,
                 " di Slothly? Lanjutkan hanya jika ini akunmu."), WFAlertActionCancelButtonShown=True)
    tested = flow.add("downloadurl", kind + "-test", WFURL=wire.text(wire.variable("Endpoint")),
                      WFHTTPMethod="POST", WFHTTPBodyType="JSON", WFHTTPHeaders=wire.dictionary([
                          wire.field("Authorization", 0, wire.text("Bearer ", wire.variable("Token"))),
                          wire.field("Content-Type", 0, wire.text("application/json")),
                          wire.field("Accept", 0, wire.text("application/json")),
                      ]), WFJSONValues=wire.dictionary([
                          wire.field("provider", 0, wire.text("apple_health")),
                          wire.field("test", 4, wire.boolean(True)),
                      ]))
    require_status(flow, kind + "-test", tested, "tested",
                   "Koneksi belum dapat diuji. Periksa internet, lalu pilih Hubungkan akun lagi di Slothly. Konfigurasi sebelumnya belum diganti.")
    # Do not persist the redemption status, input code, or arbitrary response
    # fields. Dictionary -> Text serializes JSON without manual string escaping.
    config = flow.add("dictionary", kind + "-private-config", WFItems=wire.dictionary([
        wire.field("endpoint", 0, wire.text(wire.variable("Endpoint"))),
        wire.field("token", 0, wire.text(wire.variable("Token"))),
    ]))
    config_text = flow.add("gettext", kind + "-private-json", WFTextActionText=wire.text(config))
    flow.add("file.createfolder", kind + "-create-config-folder", WFFilePath="Slothly", WFFolder=wire.SHORTCUTS_FOLDER)
    named = flow.add("setitemname", kind + "-name-config", WFInput=config_text, WFName="connection.json", WFDontIncludeFileExtension=False)
    flow.add("documentpicker.save", kind + "-save-config", WFInput=named, WFFolder=wire.SHORTCUTS_FOLDER,
             WFAskWhereToSave=False, WFFileDestinationPath="/Slothly/", WFSaveFileOverwrite=True)
    flow.otherwise(branch)
    saved = flow.add("documentpicker.open", kind + "-read-config", WFFile=wire.SHORTCUTS_FOLDER,
                     WFGetFilePath="/Slothly/connection.json", WFFileErrorIfNotFound=False)
    flow.begin(kind + "-saved-config-missing", saved, 101)
    flow.stop(kind + "-needs-pairing", "Belum terhubung. Buka Slothly → Profil → Data kesehatan, lalu pilih Hubungkan akun. Setelah tersambung sekali, Berat dan Watch menggunakan koneksi yang sama.")
    flow.end(kind + "-saved-config-missing")
    configure(flow, kind + "-saved-config", saved)
    require_production_endpoint(flow, kind + "-saved-endpoint")
    flow.end(branch)


def build(kind):
    workflow = copy.deepcopy(native(kind))
    source = workflow.pop("WFWorkflowActions")
    name = "Slothly " + kind.title()
    flow = wire.Workflow()
    details = ("Membaca berat dan persentase lemak yang tersedia hari ini dari Apple Health. "
               "Untuk otomatisasi setelah menimbang, pilih aplikasi timbangan digital milikmu saat ditutup.") if kind == "berat" else (
               "Membaca denyut istirahat, VO2 max, dan jumlah energi aktif hari ini yang tersedia di Apple Health. "
               "Otomatisasi opsional: setiap hari pukul 21.30.")
    flow.add("comment", kind + "-intro", WFCommentActionText=name + " v2. " + details +
             " Setelah memasang, pilih Hubungkan akun di Slothly sekali. Berat dan Watch memakai konfigurasi bersama di Shortcuts/Slothly/connection.json. Berkas dapat tersinkron lewat iCloud sesuai pengaturan perangkat; jangan bagikan berkas ini. Tidak menulis ke Apple Health.")
    bootstrap(flow, kind)
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
                     WFAlertActionMessage=wire.text("Data belum tersimpan. Periksa koneksi internet. Jika masih gagal, pilih Hubungkan akun lagi di Slothly → Profil → Data kesehatan."),
                     WFAlertActionCancelButtonShown=False)
            flow.add("exit", label + "-stop")
            flow.end(label)
        else:
            flow.actions.append(action)
    workflow.update(WFWorkflowName=name, WFWorkflowInputContentItemClasses=["WFStringContentItem"],
                    WFWorkflowOutputContentItemClasses=[], WFWorkflowHasShortcutInputVariables=True,
                    WFWorkflowImportQuestions=[],
                    WFWorkflowActions=flow.actions)
    return workflow


def validate(workflow, kind):
    actions = workflow["WFWorkflowActions"]
    assert len(actions) < 160, "Keep native workflows and pairing small"
    assert workflow["WFWorkflowInputContentItemClasses"] == ["WFStringContentItem"]
    assert workflow["WFWorkflowHasShortcutInputVariables"] is True
    assert workflow["WFWorkflowImportQuestions"] == []
    allowed = {"comment", "gettext", "detect.dictionary", "getvalueforkey", "setvariable", "text.match", "text.combine",
               "conditional", "alert", "exit", "nothing", "filter.health.quantity", "count",
               "properties.health.quantity", "format.date", "downloadurl", "statistics", "dictionary",
               "file.createfolder", "setitemname", "documentpicker.save", "documentpicker.open"}
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
            import re
            assert not re.search(r"(?:slothly|hp1)\.u\d+\.", value), "Embedded credential or pairing code"
            assert "Bearer" not in value or value in ("Bearer ", "Bearer \ufffc"), "Embedded Bearer value"

    preserved = []
    for index, action in enumerate(actions):
        ident, params = action["WFWorkflowActionIdentifier"], action["WFWorkflowActionParameters"]
        kind_name = ident.removeprefix("is.workflow.actions.")
        assert kind_name in allowed, "No clipboard, selection prompt, or Health write actions"
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
            if params["UUID"] == wire.uid(kind + "-redeem"):
                assert keys == ["Content-Type", "Accept"], "Redeem must not transmit a previous Bearer"
                assert params["WFURL"] == wire.text(wire.variable("RedeemURL"))
            else:
                assert keys == ["Authorization", "Content-Type", "Accept"]
                assert headers[0]["WFValue"] == wire.text("Bearer ", wire.variable("Token"))
                assert params["WFURL"] == wire.text(wire.variable("Endpoint"))
        if kind_name == "documentpicker.save":
            assert params["WFAskWhereToSave"] is False and params["WFFileDestinationPath"] == "/Slothly/"
            assert params["WFSaveFileOverwrite"] is True
        if kind_name == "documentpicker.open":
            assert params["WFGetFilePath"] == "/Slothly/connection.json" and params["WFFileErrorIfNotFound"] is False
    assert not stack
    # Native branches/queries and numeric extraction remain byte-for-byte equal.
    native_actions = native(kind)["WFWorkflowActions"]
    expected = [a for a in native_actions if not a["WFWorkflowActionIdentifier"].endswith(".downloadurl")]
    for action in expected:
        assert action in preserved, "Changed native query, extraction, count, or branch"
    assert sum(a["WFWorkflowActionIdentifier"].endswith(".downloadurl") for a in actions) == (4 if kind == "berat" else 5)
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
        "version": 2, "generatorSha256": source_hash(), "wireHelpersSha256": sha(Path(wire.__file__).read_bytes().replace(b"\r\n", b"\n")),
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
