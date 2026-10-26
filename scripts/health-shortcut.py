#!/usr/bin/env python3
"""Build the generic Slothly Apple Shortcut; Python 3 standard library only.

No user's configuration, token, or health data is part of this source/artifact.
Use --sign to send ONLY this generic workflow to an Apple signing service.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import urllib.request
import uuid

NAME = "Slothly Health Sync"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "shortcuts"
SHORTCUTS_FOLDER = {
    "fileLocation": {"WFFileLocationType": "Shortcuts", "relativeSubpath": ""},
    "filename": "Documents",
    "displayName": "Shortcuts",
}
NAMESPACE = uuid.UUID("2aa370a4-78b5-4955-a96e-7124339b8b0c")


def uid(label):
    return str(uuid.uuid5(NAMESPACE, label)).upper()


def attachment(value):
    return {"Value": value, "WFSerializationType": "WFTextTokenAttachment"}


def variable(name):
    return attachment({"Type": "Variable", "VariableName": name})


def output(label, name="Result"):
    return attachment({"Type": "ActionOutput", "OutputUUID": uid(label), "OutputName": name})


def text(*parts):
    string, refs = "", {}
    for part in parts:
        if isinstance(part, dict):
            # Apple's NSRange offsets count UTF-16 code units.
            offset = len(string.encode("utf-16-le")) // 2
            refs[f"{{{offset}, 1}}"] = part["Value"]
            string += "\ufffc"
        else:
            string += str(part)
    value = {"string": string}
    if refs:
        value["attachmentsByRange"] = refs
    return {"Value": value, "WFSerializationType": "WFTextTokenString"}


def field(key, kind, value):
    return {"WFKey": text(key), "WFItemType": kind, "WFValue": value}


def dictionary(items):
    return {"Value": {"WFDictionaryFieldValueItems": items}, "WFSerializationType": "WFDictionaryFieldValue"}


class Workflow:
    def __init__(self):
        self.actions = []

    def add(self, action, label, **params):
        self.actions.append({"WFWorkflowActionIdentifier": f"is.workflow.actions.{action}",
                             "WFWorkflowActionParameters": {"UUID": uid(label), **params}})
        return output(label)

    def set(self, name, value, label):
        if not isinstance(value, dict):
            value = self.add("gettext", label + "-literal", WFTextActionText=str(value))
        return self.add("setvariable", label, WFVariableName=name, WFInput=value)

    def begin(self, label, value, condition=100, **params):
        self.add("conditional", label + "-start", GroupingIdentifier=uid(label), WFControlFlowMode=0,
                 WFCondition=condition, WFInput={"Type": "Variable", "Variable": value}, **params)

    def otherwise(self, label):
        self.add("conditional", label + "-otherwise", GroupingIdentifier=uid(label), WFControlFlowMode=1)

    def end(self, label):
        self.add("conditional", label + "-end", GroupingIdentifier=uid(label), WFControlFlowMode=2)

    def alert(self, label, message, cancel=False):
        self.add("alert", label, WFAlertActionTitle="Slothly Health Sync",
                 WFAlertActionMessage=message if isinstance(message, dict) else text(message),
                 WFAlertActionCancelButtonShown=cancel)

    def stop(self, label, message):
        self.alert(label + "-alert", message)
        self.add("exit", label + "-stop")

    def key(self, label, key, value):
        return self.add("getvalueforkey", label, WFInput=value, WFDictionaryKey=key,
                        WFGetDictionaryValueType="Value")

    def post(self, label, body, expected_status="ok"):
        response = self.add("downloadurl", label, WFURL=text(variable("Endpoint")),
                            WFHTTPMethod="POST", WFHTTPBodyType="JSON", WFJSONValues=body,
                            WFHTTPHeaders=dictionary([
                                field("Authorization", 0, text("Bearer ", variable("Token"))),
                                field("Content-Type", 0, text("application/json")),
                                field("Accept", 0, text("application/json")),
                            ]))
        status_value = self.key(label + "-status", "status", response)
        status = self.add("gettext", label + "-status-text", WFTextActionText=text(status_value))
        self.begin(label + "-valid", status, 4, WFConditionalActionString=expected_status)
        self.add("nothing", label + "-accepted")
        self.otherwise(label + "-valid")
        self.stop(label + "-failed", "Data belum terkirim. Periksa koneksi atau sambungkan ulang di Slothly → Profil → Data kesehatan → Hubungkan Apple Health.")
        self.end(label + "-valid")
        return response

    def config(self, label, value):
        parsed = self.add("detect.dictionary", label + "-dictionary", WFInput=value)
        self.set("Endpoint", self.key(label + "-endpoint", "endpoint", parsed), label + "-set-endpoint")
        self.set("Token", self.key(label + "-token", "token", parsed), label + "-set-token")
        matches = self.add("text.match", label + "-https", text=text(variable("Endpoint")),
                           WFMatchTextPattern=r"^https://[A-Za-z0-9.-]+(?::443)?/api/health-sync$",
                           WFMatchTextCaseSensitive=True)
        self.begin(label + "-secure", matches, 101)
        self.stop(label + "-invalid-url", "Alamat koneksi tidak valid. Salin konfigurasi baru dari Profil → Data kesehatan → Hubungkan Apple Health di Slothly.")
        self.end(label + "-secure")
        self.begin(label + "-has-token", variable("Token"), 101)
        self.stop(label + "-missing-token", "Token koneksi kosong. Salin konfigurasi baru dari Profil → Data kesehatan → Hubungkan Apple Health di Slothly.")
        self.end(label + "-has-token")

    def sample(self, label, health_type, metric):
        found = self.add("filter.health.quantity", label + "-find", WFContentItemFilter={
            "Value": {"WFActionParameterFilterPrefix": 1, "WFContentPredicateBoundedDate": False,
                      "WFActionParameterFilterTemplates": [{"Bounded": True, "Operator": 4,
                          "Property": "Type", "Removable": False,
                          "Values": {"Enumeration": {"Value": health_type, "WFSerializationType": "WFStringSubstitutableState"}}}]},
            "WFSerializationType": "WFContentPredicateTableTemplate"},
            WFContentItemSortProperty="Start Date", WFContentItemSortOrder="Latest First",
            WFContentItemLimitEnabled=True, WFContentItemLimitNumber=1)
        self.begin(label + "-exists", found)
        value = self.add("properties.health.quantity", label + "-value", WFInput=found, WFContentItemPropertyName="Value")
        unit = self.add("properties.health.quantity", label + "-unit", WFInput=found, WFContentItemPropertyName="Unit")
        date = self.add("properties.health.quantity", label + "-date", WFInput=found, WFContentItemPropertyName="Start Date")
        date_iso = self.add("format.date", label + "-iso", WFDate=text(date), WFDateFormatStyle="ISO 8601", WFISO8601IncludeTime=True)
        formatted_date = self.add("text.match", label + "-date-shape", text=text(date_iso),
                                  WFMatchTextPattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$",
                                  WFMatchTextCaseSensitive=True)
        self.begin(label + "-date-complete", formatted_date, 101)
        self.stop(label + "-date-incomplete", "Tanggal pengukuran belum dapat dibaca lengkap. Data belum dikirim. Periksa tindakan Format Date di Shortcut: pilih ISO 8601 dan aktifkan Include Time.")
        self.end(label + "-date-complete")
        if metric == "weightKg":
            self.set("WeightKg", value, label + "-initial-kg")
            # Convert the actual sample unit. Do not assume the user's Health display is kg.
            for i, (pattern, factor) in enumerate([(r"(?i)^(kg|kilogram|kilograms)$", 1),
                   (r"(?i)^(lb|lbs|pound|pounds)$", 0.45359237),
                   (r"(?i)^(g|gram|grams)$", 0.001), (r"(?i)^(st|stone|stones)$", 6.35029318)]):
                matched = self.add("text.match", f"{label}-unit-{i}", text=text(unit), WFMatchTextPattern=pattern, WFMatchTextCaseSensitive=False)
                self.begin(f"{label}-convert-{i}", matched)
                converted = self.add("math", f"{label}-math-{i}", WFInput=value, WFMathOperation="×", WFMathOperand=factor)
                self.set("WeightKg", converted, f"{label}-save-kg-{i}")
                self.set("RecognizedWeightUnit", "yes", f"{label}-recognized-{i}")
                self.end(f"{label}-convert-{i}")
            self.begin(label + "-unit-known", variable("RecognizedWeightUnit"), 101)
            self.stop(label + "-unit-unsupported", text("Satuan berat belum didukung: ", unit, ". Ubah satuan berat di Apple Health ke kg lalu coba lagi."))
            self.end(label + "-unit-known")
            normalized = variable("WeightKg")
        else:
            matched = self.add("text.match", label + "-percent-unit", text=text(unit), WFMatchTextPattern=r"^(%|percent|percentage)$", WFMatchTextCaseSensitive=False)
            self.begin(label + "-percent-known", matched, 101)
            self.stop(label + "-percent-unsupported", text("Satuan persentase lemak belum dikenali: ", unit, ". Data ini belum dikirim."))
            self.end(label + "-percent-known")
            normalized = value
        self.set(metric + "Value", normalized, label + "-save-value")
        self.set(metric + "Date", date_iso, label + "-save-date")
        self.set(metric + "Available", "yes", label + "-mark-sample")
        self.end(label + "-exists")

    def send_samples(self, label, metrics):
        items = []
        for metric in metrics:
            sample = dictionary([field("metric", 0, text(metric)),
                                field("value", 1, text(variable(metric + "Value"))),
                                field("measuredAt", 0, text(variable(metric + "Date")))])
            items.append({"WFItemType": 3, "WFValue": sample})
        response = self.post(label, dictionary([
            field("provider", 0, text("apple_health")),
            field("samples", 2, {"Value": items, "WFSerializationType": "WFArrayParameterState"}),
        ]))
        self.set("SyncResponse", response, label + "-save-response")


def build():
    w = Workflow()
    w.add("comment", "intro", WFCommentActionText="Slothly Health Sync v1. Membaca berat dan persentase lemak terbaru beserta tanggal pengukuran aslinya. Tidak menulis data ke Apple Health. Konfigurasi disimpan di folder Shortcuts/Slothly/connection.json; folder ini dapat tersinkron lewat iCloud sesuai pengaturan perangkat. Jangan bagikan berkas konfigurasi tersebut.")
    incoming = attachment({"Type": "ExtensionInput"})
    w.begin("received-config", incoming)
    # Get Text creates an explicit string to save, rather than persisting Shortcut Input attachments.
    config_text = w.add("gettext", "config-json", WFTextActionText=text(incoming))
    w.config("new-config", config_text)
    w.alert("confirm-destination", text("Hubungkan Apple Health ke:\n", variable("Endpoint"), "\n\nHanya berat dan persentase lemak terbaru yang dibaca. Konfigurasi disimpan di folder Shortcuts/Slothly; folder ini dapat tersinkron lewat iCloud. Lanjutkan hanya jika alamatnya sesuai app Slothly milikmu."), cancel=True)
    w.post("test-connection", dictionary([field("provider", 0, text("apple_health")), field("test", 4, True)]), expected_status="tested")
    w.add("file.createfolder", "create-config-folder", WFFilePath="Slothly", WFFolder=SHORTCUTS_FOLDER)
    named = w.add("setitemname", "name-config-file", WFInput=config_text, WFName="connection.json", WFDontIncludeFileExtension=False)
    w.add("documentpicker.save", "save-config", WFInput=named, WFFolder=SHORTCUTS_FOLDER,
          WFAskWhereToSave=False, WFFileDestinationPath="/Slothly/", WFSaveFileOverwrite=True)
    # Clear the transferred token after successful persistence; don't read unrelated clipboard data.
    empty = w.add("gettext", "empty-clipboard", WFTextActionText="Slothly")
    w.add("setclipboard", "clear-config-clipboard", WFInput=empty, WFLocalOnly=True)
    w.otherwise("received-config")
    saved = w.add("documentpicker.open", "read-config", WFFile=SHORTCUTS_FOLDER,
                  WFGetFilePath="/Slothly/connection.json", WFFileErrorIfNotFound=False)
    w.begin("saved-config-exists", saved, 101)
    w.stop("needs-configuration", "Belum tersambung. Buka Slothly → Profil → Data kesehatan → Hubungkan Apple Health, salin konfigurasi lalu pilih Buka Shortcut.")
    w.end("saved-config-exists")
    w.config("saved-config", saved)
    w.end("received-config")
    w.sample("weight", "Body Mass", "weightKg")
    w.sample("body-fat", "Body Fat Percentage", "bodyFatPercent")
    w.begin("has-weight", variable("weightKgAvailable"))
    w.begin("has-both", variable("bodyFatPercentAvailable"))
    w.send_samples("send-both", ["weightKg", "bodyFatPercent"])
    w.otherwise("has-both")
    w.send_samples("send-weight", ["weightKg"])
    w.end("has-both")
    w.otherwise("has-weight")
    w.begin("has-fat-only", variable("bodyFatPercentAvailable"))
    w.send_samples("send-fat", ["bodyFatPercent"])
    w.otherwise("has-fat-only")
    w.stop("no-samples", "Tidak ada berat atau persentase lemak yang dapat dibaca. Periksa datanya di Apple Health dan izin baca Shortcuts. Belum ada pengukuran yang dikirim ke Slothly.")
    w.end("has-fat-only")
    w.end("has-weight")
    received = w.key("received-count", "received", variable("SyncResponse"))
    ignored = w.key("ignored-count", "ignored", variable("SyncResponse"))
    w.begin("imported-new-data", received, 2, WFNumberValue="0")
    w.alert("sync-result", text(received, " pengukuran disimpan di Slothly. Tanggal catatan mengikuti tanggal pengukuran di Apple Health. Periksa tanggal dan jenis data di Profil → Data kesehatan → Hubungkan Apple Health. Nilainya dapat dilihat di Perjalanan."))
    w.otherwise("imported-new-data")
    w.alert("sync-unchanged", text("Data sudah diperiksa. Tidak ada pengukuran baru yang disimpan; ", ignored, " pengukuran sudah ada atau lebih lama daripada catatan tersimpan. Periksa tanggalnya di Profil → Data kesehatan → Hubungkan Apple Health. Nilainya dapat dilihat di Perjalanan."))
    w.end("imported-new-data")
    return {
        "WFWorkflowName": NAME, "WFWorkflowClientVersion": "3107.0.8.2", "WFWorkflowClientRelease": "22.1",
        "WFWorkflowMinimumClientVersion": 900, "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 4292093695, "WFWorkflowIconGlyphNumber": 59511},
        "WFWorkflowTypes": ["NCWidget"], "WFWorkflowInputContentItemClasses": ["WFStringContentItem"],
        "WFWorkflowOutputContentItemClasses": [], "WFWorkflowImportQuestions": [],
        "WFWorkflowHasShortcutInputVariables": True, "WFWorkflowActions": w.actions,
    }


def validate(workflow):
    actions = workflow["WFWorkflowActions"]
    seen, stack = set(), []

    def refs(value):
        if isinstance(value, dict):
            if "OutputUUID" in value:
                assert value["OutputUUID"] in seen, "Forward or missing action output reference"
            if value.get("WFSerializationType") == "WFTextTokenString":
                encoded = value["Value"]["string"].encode("utf-16-le")
                ranges = value["Value"].get("attachmentsByRange", {})
                assert encoded.count(b"\xfc\xff") == len(ranges), "Unbound text attachment"
                for key in ranges:
                    index = int(key.split(",")[0][1:])
                    assert encoded[index * 2:index * 2 + 2] == b"\xfc\xff", "Bad attachment offset"
            for item in value.values():
                refs(item)
        elif isinstance(value, list):
            for item in value:
                refs(item)

    for action in actions:
        ident, params = action["WFWorkflowActionIdentifier"], action["WFWorkflowActionParameters"]
        assert ".health.quantity.log" not in ident, "Shortcut must never write Health data"
        refs(params)
        if ident.endswith(".conditional"):
            group, mode = params["GroupingIdentifier"], params["WFControlFlowMode"]
            if mode == 0:
                stack.append(group)
            else:
                assert stack and stack[-1] == group, "Mismatched conditional"
                if mode == 2:
                    stack.pop()
        assert params["UUID"] not in seen, "Duplicate action UUID"
        seen.add(params["UUID"])
    assert not stack, "Unclosed conditional"
    assert sum(a["WFWorkflowActionIdentifier"].endswith(".filter.health.quantity") for a in actions) == 2


def sha(data):
    return hashlib.sha256(data).hexdigest()


def generator_sha():
    # Stable across Windows CRLF and Unix LF checkouts.
    return sha(Path(__file__).read_bytes().replace(b"\r\n", b"\n"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sign", action="store_true", help="Upload the generic workflow only, then save a signed AEA1 artifact")
    parser.add_argument("--check", action="store_true", help="Check reproducible unsigned source and signed manifest without uploading")
    parser.add_argument("--signing-server", default="https://sign.shortcuty.app/api/v1/sign")
    args = parser.parse_args()
    workflow = build()
    validate(workflow)
    unsigned = plistlib.dumps(workflow, fmt=plistlib.FMT_XML, sort_keys=False)
    unsigned_path = OUTPUT / "slothly-health-sync.unsigned.plist"
    signed_path = OUTPUT / "slothly-health-sync.shortcut"
    manifest_path = OUTPUT / "manifest.json"
    if args.check:
        assert unsigned_path.read_bytes().replace(b"\r\n", b"\n") == unsigned, "Unsigned artifact does not match generator"
        signed = signed_path.read_bytes()
        assert signed.startswith(b"AEA1"), "Shortcut is not a signed Apple Archive"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert manifest["unsignedSha256"] == sha(unsigned), "Unsigned source hash mismatch"
        assert manifest["signedSha256"] == sha(signed), "Signed artifact hash mismatch"
        assert manifest["generatorSha256"] == generator_sha(), "Generator hash mismatch"
        print(f"Verified {len(workflow['WFWorkflowActions'])} actions; signed AEA1 artifact and source hashes match.")
        return
    OUTPUT.mkdir(parents=True, exist_ok=True)
    unsigned_path.write_bytes(unsigned)
    print(f"Built {len(workflow['WFWorkflowActions'])} actions: {unsigned_path.name}")
    if not args.sign:
        return
    assert args.signing_server.startswith("https://"), "Signing service must use HTTPS"
    req = urllib.request.Request(args.signing_server, data=unsigned, method="POST", headers={
        "Content-Type": "application/octet-stream", "X-Filename": f"{NAME}.shortcut",
        "User-Agent": "Slothly-Health-Shortcut-Builder/1.0",
    })
    with urllib.request.urlopen(req, timeout=60) as response:
        signed = response.read()
        reported_input = response.headers.get("X-Shortcut-Input-SHA256")
    assert signed.startswith(b"AEA1"), "Signing service did not return a signed shortcut"
    if reported_input:
        assert reported_input == sha(unsigned), "Signing service signed different input"
    signed_path.write_bytes(signed)
    manifest_path.write_text(json.dumps({"name": NAME, "version": 1, "actions": len(workflow["WFWorkflowActions"]),
        "installPath": "/shortcuts/slothly-health-sync.shortcut", "signingFormat": "AEA1", "signingMode": "anyone",
        "signingService": args.signing_server, "unsignedSha256": sha(unsigned), "signedSha256": sha(signed),
        "generatorSha256": generator_sha(),
        "deviceVerification": "Pending real iPhone import, permissions, and sample transfer validation"}, indent=2) + "\n", encoding="utf-8")
    print(f"Signed generic workflow: {signed_path.name} ({len(signed)} bytes). No user token or health data was uploaded.")


if __name__ == "__main__":
    main()
