#!/usr/bin/env python3
"""Exercise the compiled Shortcut's branches with synthetic Health/API fixtures.

This checks the generated plist, not Apple's private action implementations.
An actual iPhone import/run is still required to verify OS permissions and units.
"""
import importlib.util
import json
from pathlib import Path
import re
import sys
import unittest

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("health_shortcut", Path(__file__).with_name("health-shortcut.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class Stopped(Exception):
    pass


class ShortcutFixture:
    def __init__(self, samples=None, config=None, saved=None, reject=None, received=None):
        self.samples = samples or {}
        self.config = json.dumps(config) if config else None
        self.saved = json.dumps(saved) if saved else None
        self.reject, self.received = reject, received
        self.variables, self.outputs, self.requests, self.alerts = {}, {}, [], []
        self.files = {}

    def resolve(self, value):
        if isinstance(value, list):
            return [self.resolve(v) for v in value]
        if not isinstance(value, dict):
            return value
        kind = value.get("WFSerializationType")
        if kind == "WFTextTokenAttachment":
            ref = value["Value"]
            if ref["Type"] == "ActionOutput":
                return self.outputs.get(ref["OutputUUID"])
            if ref["Type"] == "Variable":
                return self.variables.get(ref["VariableName"])
            if ref["Type"] == "ExtensionInput":
                return self.config
        if kind == "WFTextTokenString":
            state = value["Value"]
            string = state["string"]
            # Fixtures contain no astral characters before attachments.
            for key, ref in reversed(list(state.get("attachmentsByRange", {}).items())):
                index = int(key.split(",")[0][1:])
                result = self.resolve(builder.attachment(ref))
                string = string[:index] + ("" if result is None else str(result)) + string[index + 1:]
            return string
        if kind == "WFDictionaryFieldValue":
            result = {}
            for item in value["Value"]["WFDictionaryFieldValueItems"]:
                key, item_value = self.resolve(item["WFKey"]), self.resolve(item["WFValue"])
                result[key] = float(item_value) if item["WFItemType"] == 1 else item_value
            return result
        if kind == "WFArrayParameterState":
            return [self.resolve(v["WFValue"]) for v in value["Value"]]
        return value

    def condition(self, p):
        value = self.resolve(p["WFInput"]["Variable"])
        code = p["WFCondition"]
        if code == 100:
            return value is not None and value != "" and value != []
        if code == 101:
            return value is None or value == "" or value == []
        if code == 4:
            return str(value) == p["WFConditionalActionString"]
        if code == 2:
            return float(value) > float(p["WFNumberValue"])
        raise AssertionError(f"Unmodelled condition {code}")

    def run(self):
        workflow = builder.build()
        builder.validate(workflow)
        stack = []
        try:
            for action in workflow["WFWorkflowActions"]:
                ident, p = action["WFWorkflowActionIdentifier"].removeprefix("is.workflow.actions."), action["WFWorkflowActionParameters"]
                if ident == "conditional":
                    mode = p["WFControlFlowMode"]
                    if mode == 0:
                        parent_active = all(s[1] for s in stack)
                        condition = self.condition(p) if parent_active else False
                        stack.append([condition, parent_active and condition, parent_active])
                    elif mode == 1:
                        stack[-1][1] = stack[-1][2] and not stack[-1][0]
                    else:
                        stack.pop()
                    continue
                if not all(s[1] for s in stack):
                    continue
                result = None
                if ident in ("comment", "nothing", "file.createfolder", "setclipboard"):
                    pass
                elif ident == "gettext":
                    result = self.resolve(p["WFTextActionText"])
                elif ident == "detect.dictionary":
                    result = json.loads(self.resolve(p["WFInput"]))
                elif ident == "setvariable":
                    result = self.resolve(p["WFInput"])
                    self.variables[p["WFVariableName"]] = result
                elif ident == "getvalueforkey":
                    result = self.resolve(p["WFInput"]).get(p["WFDictionaryKey"])
                elif ident == "text.match":
                    flags = 0 if p.get("WFMatchTextCaseSensitive") else re.IGNORECASE
                    result = re.findall(p["WFMatchTextPattern"], self.resolve(p["text"]), flags)
                elif ident == "alert":
                    self.alerts.append(self.resolve(p["WFAlertActionMessage"]))
                elif ident == "exit":
                    raise Stopped()
                elif ident == "documentpicker.open":
                    result = self.saved
                elif ident == "setitemname":
                    result = self.resolve(p["WFInput"])
                elif ident == "documentpicker.save":
                    self.files["connection.json"] = self.resolve(p["WFInput"])
                elif ident == "filter.health.quantity":
                    health_type = p["WFContentItemFilter"]["Value"]["WFActionParameterFilterTemplates"][0]["Values"]["Enumeration"]["Value"]
                    result = self.samples.get(health_type)
                elif ident == "properties.health.quantity":
                    result = self.resolve(p["WFInput"])[p["WFContentItemPropertyName"]]
                elif ident == "format.date":
                    result = self.resolve(p["WFDate"])
                elif ident == "math":
                    result = float(self.resolve(p["WFInput"])) * p["WFMathOperand"]
                elif ident == "downloadurl":
                    body = self.resolve(p["WFJSONValues"])
                    self.requests.append(body)
                    if self.reject == ("test" if body.get("test") else "ingest"):
                        result = {"error": "synthetic failure"}
                    elif body.get("test"):
                        result = {"ok": True, "status": "tested", "tested": True}
                    else:
                        count = len(body["samples"]) if self.received is None else self.received
                        result = {"ok": True, "status": "ok", "received": count, "ignored": len(body["samples"]) - count}
                else:
                    raise AssertionError(f"Unmodelled action: {ident}")
                self.outputs[p["UUID"]] = result
        except Stopped:
            pass
        return self


CONFIG = {"endpoint": "https://slothly.example/api/health-sync", "token": "synthetic-fixture-only"}
WEIGHT = {"Value": 198.416035, "Unit": "lb", "Start Date": "2026-10-25T07:05:10+07:00"}
BODY_FAT = {"Value": 30.3, "Unit": "%", "Start Date": "2026-10-20T06:01:00+07:00"}


class CompiledFlowTests(unittest.TestCase):
    def test_both_metrics_one_request_original_independent_dates(self):
        result = ShortcutFixture({"Body Mass": WEIGHT, "Body Fat Percentage": BODY_FAT}, saved=CONFIG).run()
        self.assertEqual(len(result.requests), 1)
        samples = result.requests[0]["samples"]
        self.assertEqual([s["metric"] for s in samples], ["weightKg", "bodyFatPercent"])
        self.assertAlmostEqual(samples[0]["value"], 90, places=3)
        self.assertEqual(samples[0]["measuredAt"], WEIGHT["Start Date"])
        self.assertEqual(samples[1]["measuredAt"], BODY_FAT["Start Date"])
        self.assertEqual(samples[1]["value"], 30.3)

    def test_weight_or_fat_only(self):
        for health_type, sample, metric in [("Body Mass", WEIGHT, "weightKg"), ("Body Fat Percentage", BODY_FAT, "bodyFatPercent")]:
            result = ShortcutFixture({health_type: sample}, saved=CONFIG).run()
            self.assertEqual(len(result.requests), 1)
            self.assertEqual(len(result.requests[0]["samples"]), 1)
            self.assertEqual(result.requests[0]["samples"][0]["metric"], metric)

    def test_no_health_samples_never_sends_ingest(self):
        result = ShortcutFixture(saved=CONFIG).run()
        self.assertEqual(result.requests, [])
        self.assertIn("Belum ada pengukuran", result.alerts[-1])

    def test_configuration_verified_before_saved_and_no_health_file(self):
        result = ShortcutFixture(config=CONFIG).run()
        self.assertEqual(result.requests, [{"provider": "apple_health", "test": True}])
        self.assertEqual(json.loads(result.files["connection.json"]), CONFIG)
        self.assertEqual(set(result.files), {"connection.json"})

    def test_failed_configuration_not_saved(self):
        result = ShortcutFixture(config=CONFIG, reject="test").run()
        self.assertEqual(result.files, {})
        self.assertIn("Data belum terkirim", result.alerts[-1])

    def test_bad_endpoint_never_receives_token_or_samples(self):
        for endpoint in ["http://slothly.example/api/health-sync", "https://slothly.example/api/other", "https://x.example/api/health-sync?token=no"]:
            result = ShortcutFixture(config={**CONFIG, "endpoint": endpoint}).run()
            self.assertEqual(result.requests, [])
            self.assertEqual(result.files, {})

    def test_unchanged_result_does_not_claim_import(self):
        result = ShortcutFixture({"Body Mass": WEIGHT}, saved=CONFIG, received=0).run()
        self.assertIn("Tidak ada pengukuran baru", result.alerts[-1])

    def test_rejected_ingest_never_reports_success(self):
        result = ShortcutFixture({"Body Mass": WEIGHT}, saved=CONFIG, reject="ingest").run()
        self.assertIn("Data belum terkirim", result.alerts[-1])
        self.assertNotIn("pengukuran disimpan", result.alerts[-1])

    def test_unsupported_weight_unit_stops_without_guessing(self):
        result = ShortcutFixture({"Body Mass": {**WEIGHT, "Unit": "unknown"}}, saved=CONFIG).run()
        self.assertEqual(result.requests, [])
        self.assertIn("Satuan berat belum didukung", result.alerts[-1])

    def test_timestamp_requires_seconds_and_timezone_before_ingest(self):
        for date in ["2026-10-25", "2026-10-25T07:00+07:00", "2026-10-25T07:00:00", "2026-10-25T07:00:00+0700"]:
            result = ShortcutFixture({"Body Mass": {**WEIGHT, "Start Date": date}}, saved=CONFIG).run()
            self.assertEqual(result.requests, [])
            self.assertIn("Tanggal pengukuran belum dapat dibaca lengkap", result.alerts[-1])
        for date in ["2026-10-25T07:00:00Z", "2026-10-25T07:00:00+07:00", "2026-10-25T07:00:00.250-04:00"]:
            result = ShortcutFixture({"Body Mass": {**WEIGHT, "Start Date": date}}, saved=CONFIG).run()
            self.assertEqual(len(result.requests), 1)
            self.assertEqual(result.requests[0]["samples"][0]["measuredAt"], date)


if __name__ == "__main__":
    unittest.main()
