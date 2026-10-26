#!/usr/bin/env python3
"""Exercise the compiled Shortcut's branches with synthetic Health/API fixtures.

This checks the generated plist, not Apple's private action implementations.
An actual iPhone import/run is still required to verify OS permissions and units.
"""
import copy
import importlib.util
import itertools
import json
from pathlib import Path
import plistlib
import re
import sys
import unittest

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("health_shortcut", Path(__file__).with_name("health-shortcut.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


# Minimal, independently recorded wire-format fixtures from actual exported
# Apple Shortcuts in Federico Viticci / MacStories' MIT-licensed corpus:
# https://github.com/viticci/shortcuts-playground-plugin/tree/main/claude/skills/shortcuts-playground/golden-shortcuts/xml
# 2e0fb675e45948aaacee7e534f910492.xml: January Number row (type 3).
# 3dd4ee24e43f464f92adaa70a0311eaa.xml: All Day Boolean row (type 4).
# ef669bcf8bad489d9ef4b88bfaf5772f.xml: time_entry nested JSON Dictionary row
# (type 1, double wrapper). Only relevant rows are retained below.
# 51cc4e26d1044893a0c3f2f3630cf2d2.xml: Split/Combine Text input key
# `text`, retained separately below. WFInput is NOT their input parameter.
# Do not derive these fixtures or the decoder's type codes from the generator.
#
# MIT License
# Copyright (c) 2026 Federico Viticci / MacStories
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
EXPORTED_TYPED_FIELDS = plistlib.loads(b'''<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Value</key><dict><key>WFDictionaryFieldValueItems</key><array>
    <dict><key>WFItemType</key><integer>3</integer>
      <key>WFKey</key><dict><key>Value</key><dict><key>string</key><string>January</string></dict><key>WFSerializationType</key><string>WFTextTokenString</string></dict>
      <key>WFValue</key><dict><key>Value</key><dict><key>string</key><string>31</string></dict><key>WFSerializationType</key><string>WFTextTokenString</string></dict>
    </dict>
    <dict><key>WFItemType</key><integer>4</integer>
      <key>WFKey</key><dict><key>Value</key><dict><key>string</key><string>All Day</string></dict><key>WFSerializationType</key><string>WFTextTokenString</string></dict>
      <key>WFValue</key><dict><key>Value</key><integer>1</integer><key>WFSerializationType</key><string>WFNumberSubstitutableState</string></dict>
    </dict>
    <dict><key>WFItemType</key><integer>1</integer>
      <key>WFKey</key><dict><key>Value</key><dict><key>string</key><string>time_entry</string></dict><key>WFSerializationType</key><string>WFTextTokenString</string></dict>
      <key>WFValue</key><dict><key>Value</key><dict>
        <key>Value</key><dict><key>WFDictionaryFieldValueItems</key><array>
          <dict><key>WFItemType</key><integer>0</integer>
            <key>WFKey</key><dict><key>Value</key><dict><key>string</key><string>created_with</string></dict><key>WFSerializationType</key><string>WFTextTokenString</string></dict>
            <key>WFValue</key><dict><key>Value</key><dict><key>string</key><string>Workflow</string></dict><key>WFSerializationType</key><string>WFTextTokenString</string></dict>
          </dict>
        </array></dict><key>WFSerializationType</key><string>WFDictionaryFieldValue</string>
      </dict><key>WFSerializationType</key><string>WFDictionaryFieldValue</string></dict>
    </dict>
  </array></dict><key>WFSerializationType</key><string>WFDictionaryFieldValue</string>
</dict></plist>''')

# Minimal actual exported action rows from the same MIT corpus/notice above.
# https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/golden-shortcuts/xml/51cc4e26d1044893a0c3f2f3630cf2d2.xml
EXPORTED_TEXT_TRANSFORMS = plistlib.loads(b'''<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><array>
  <dict><key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.text.split</string>
    <key>WFWorkflowActionParameters</key><dict>
      <key>Show-text</key><true/><key>UUID</key><string>E7C4458C-4167-416C-BF22-45C83B3FCA40</string>
      <key>text</key><dict><key>Value</key><dict><key>OutputName</key><string>Text</string><key>OutputUUID</key><string>6E47EB56-D943-4EF3-91DD-D365C159A63A</string><key>Type</key><string>ActionOutput</string></dict><key>WFSerializationType</key><string>WFTextTokenAttachment</string></dict>
    </dict>
  </dict>
  <dict><key>WFWorkflowActionIdentifier</key><string>is.workflow.actions.text.combine</string>
    <key>WFWorkflowActionParameters</key><dict>
      <key>Show-text</key><true/><key>UUID</key><string>B20DF477-4CE2-4DDE-9F33-1F79F41EA3B0</string>
      <key>text</key><dict><key>Value</key><dict><key>Type</key><string>Variable</string><key>VariableName</key><string>Emoji</string></dict><key>WFSerializationType</key><string>WFTextTokenAttachment</string></dict>
    </dict>
  </dict>
</array></plist>''')


def text_transform_input(params):
    """Use the input key observed in exported Split/Combine Text action rows."""
    assert "text" in params, "Split/Combine Text requires its exported text input parameter"
    assert "WFInput" not in params, "WFInput is not a Split/Combine Text input parameter"
    return params["text"]


def decode_dictionary(value, resolve_text):
    """Strict wire decoder grounded in exported XML, independent of build helpers."""
    assert isinstance(value, dict) and value.get("WFSerializationType") == "WFDictionaryFieldValue", "Expected dictionary envelope"
    state = value.get("Value")
    assert isinstance(state, dict) and isinstance(state.get("WFDictionaryFieldValueItems"), list), "Expected dictionary field rows"
    result = {}
    for item in state["WFDictionaryFieldValueItems"]:
        key = item.get("WFKey")
        assert isinstance(key, dict) and key.get("WFSerializationType") == "WFTextTokenString", "Expected text key"
        result[resolve_text(key)] = decode_item(item, resolve_text)
    return result


def decode_item(item, resolve_text):
    kind, value = item.get("WFItemType"), item.get("WFValue")
    assert isinstance(value, dict), "Typed WFValue must have a serialization envelope"
    serialization = value.get("WFSerializationType")
    if kind in (0, 3):
        assert serialization == "WFTextTokenString", "Text/Number row requires text-token state"
        resolved = resolve_text(value)
        return float(resolved) if kind == 3 else resolved
    if kind == 1:
        assert serialization == "WFDictionaryFieldValue", "Dictionary row requires dictionary state"
        # Nested dictionary rows have TWO WFDictionaryFieldValue envelopes.
        return decode_dictionary(value.get("Value"), resolve_text)
    if kind == 2:
        assert serialization == "WFArrayParameterState" and isinstance(value.get("Value"), list), "Array row requires array state"
        return [decode_item(child, resolve_text) for child in value["Value"]]
    if kind == 4:
        assert serialization == "WFNumberSubstitutableState", "Boolean row requires substitutable state"
        assert type(value.get("Value")) is int and value["Value"] in (0, 1), "Boolean state must be 0 or 1"
        return bool(value["Value"])
    raise AssertionError(f"Unknown dictionary row type {kind}")


class Stopped(Exception):
    pass


class ShortcutFixture:
    def __init__(self, samples=None, config=None, saved=None, reject=None, received=None, error_code=None, selected=None, denied=None):
        self.samples = samples or {}
        self.config = json.dumps(config) if config else None
        self.saved = json.dumps(saved) if saved else None
        self.reject, self.received = reject, received
        self.error_code = error_code
        self.selected = selected if selected is not None else [item[1] for item in builder.METRICS]
        self.denied = set(denied or [])
        self.reads = []
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
            return decode_dictionary(value, self.resolve)
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

    def run(self, workflow=None):
        workflow = workflow if workflow is not None else builder.build()
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
                elif ident == "text.split":
                    assert p["WFTextSeparator"] == "New Lines"
                    result = self.resolve(text_transform_input(p)).split("\n")
                elif ident == "choosefromlist":
                    assert p["WFChooseFromListActionSelectMultiple"] is True
                    choices = self.resolve(p["WFInput"])
                    assert all(value in choices for value in self.selected)
                    result = self.selected
                elif ident == "text.combine":
                    assert p["WFTextSeparator"] == "New Lines"
                    result = "\n".join(self.resolve(text_transform_input(p)))
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
                    self.reads.append(health_type)
                    if health_type in self.denied:
                        # Apple's action can raise before returning an empty
                        # sample. The Shortcut does not catch this exception.
                        raise PermissionError("Read permission denied: " + health_type)
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
                        result = {"status": "error", "code": self.error_code, "error": "sensitive synthetic detail " + CONFIG["token"]}
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
VO2_MAX = {"Value": 37.8, "Unit": "ml/(kg*min)", "Start Date": "2026-10-19T09:15:00-04:00"}
RESTING_HEART_RATE = {"Value": 63, "Unit": "count/min", "Start Date": "2026-10-26T05:10:00+07:00"}


class ExportedWireFormatTests(unittest.TestCase):
    def test_actual_exported_text_actions_require_text_input(self):
        self.assertEqual([action["WFWorkflowActionIdentifier"] for action in EXPORTED_TEXT_TRANSFORMS],
            ["is.workflow.actions.text.split", "is.workflow.actions.text.combine"])
        for action in EXPORTED_TEXT_TRANSFORMS:
            params = action["WFWorkflowActionParameters"]
            self.assertEqual(text_transform_input(params)["WFSerializationType"], "WFTextTokenAttachment")
            invalid = copy.deepcopy(params)
            invalid["WFInput"] = invalid.pop("text")
            with self.assertRaisesRegex(AssertionError, "requires its exported text"):
                text_transform_input(invalid)

    def test_old_v3_split_or_combine_wfinput_wiring_is_rejected(self):
        for action_id in ("is.workflow.actions.text.split", "is.workflow.actions.text.combine"):
            workflow = copy.deepcopy(builder.build())
            action = next(action for action in workflow["WFWorkflowActions"] if action["WFWorkflowActionIdentifier"] == action_id)
            params = action["WFWorkflowActionParameters"]
            params["WFInput"] = params.pop("text")
            with self.assertRaisesRegex(AssertionError, "requires its exported text"):
                ShortcutFixture(saved=CONFIG, selected=["Berat badan"]).run(workflow)

    def test_independent_exported_typed_rows(self):
        decoded = decode_dictionary(EXPORTED_TYPED_FIELDS, lambda value: value["Value"]["string"])
        self.assertEqual(decoded, {"January": 31.0, "All Day": True, "time_entry": {"created_with": "Workflow"}})
        self.assertIs(type(decoded["All Day"]), bool)

    def test_old_number_as_dictionary_type_is_rejected(self):
        invalid = copy.deepcopy(EXPORTED_TYPED_FIELDS)
        invalid["Value"]["WFDictionaryFieldValueItems"][0]["WFItemType"] = 1
        with self.assertRaises(AssertionError):
            decode_dictionary(invalid, lambda value: value["Value"]["string"])

    def test_old_dictionary_as_number_type_is_rejected(self):
        invalid = copy.deepcopy(EXPORTED_TYPED_FIELDS)
        invalid["Value"]["WFDictionaryFieldValueItems"][2]["WFItemType"] = 3
        with self.assertRaises(AssertionError):
            decode_dictionary(invalid, lambda value: value["Value"]["string"])

    def test_old_raw_boolean_is_rejected(self):
        invalid = copy.deepcopy(EXPORTED_TYPED_FIELDS)
        invalid["Value"]["WFDictionaryFieldValueItems"][1]["WFValue"] = True
        with self.assertRaises(AssertionError):
            decode_dictionary(invalid, lambda value: value["Value"]["string"])

    def test_missing_nested_dictionary_wrapper_is_rejected(self):
        invalid = copy.deepcopy(EXPORTED_TYPED_FIELDS)
        row = invalid["Value"]["WFDictionaryFieldValueItems"][2]
        row["WFValue"] = row["WFValue"]["Value"]
        with self.assertRaises(AssertionError):
            decode_dictionary(invalid, lambda value: value["Value"]["string"])


class CompiledFlowTests(unittest.TestCase):
    def test_all_fifteen_available_subsets_are_one_numeric_request(self):
        fixtures = {"Body Mass": WEIGHT, "Body Fat Percentage": BODY_FAT,
            "Cardio Fitness": VO2_MAX, "Resting Heart Rate": RESTING_HEART_RATE}
        for count in range(1, 5):
            for available in itertools.combinations(builder.METRICS, count):
                samples = {item[2]: fixtures[item[2]] for item in available}
                result = ShortcutFixture(samples, saved=CONFIG).run()
                self.assertEqual(len(result.requests), 1)
                self.assertEqual([sample["metric"] for sample in result.requests[0]["samples"]], [item[3] for item in available])
                for item, sample in zip(available, result.requests[0]["samples"]):
                    self.assertIs(type(sample["value"]), float)
                    self.assertEqual(sample["measuredAt"], fixtures[item[2]]["Start Date"])
                    if item[3] != "weightKg":
                        self.assertEqual(sample["value"], fixtures[item[2]]["Value"])

    def test_deselected_denied_body_fat_is_never_queried(self):
        result = ShortcutFixture({"Body Mass": WEIGHT, "Body Fat Percentage": BODY_FAT},
            saved=CONFIG, selected=["Berat badan"], denied=["Body Fat Percentage"]).run()
        self.assertEqual(result.reads, ["Body Mass"])
        self.assertEqual(result.requests[0]["samples"][0]["metric"], "weightKg")

    def test_selecting_a_denied_type_is_not_falsely_reported_as_caught(self):
        fixture = ShortcutFixture(saved=CONFIG, selected=["Lemak tubuh"], denied=["Body Fat Percentage"])
        with self.assertRaises(PermissionError):
            fixture.run()
        self.assertEqual(fixture.requests, [])

    def test_no_selection_reads_nothing_and_sends_no_ingest(self):
        fixture = ShortcutFixture(saved=CONFIG, selected=[]).run()
        self.assertEqual(fixture.reads, [])
        self.assertEqual(fixture.requests, [])
        self.assertIn("Tidak ada jenis data", fixture.alerts[-1])

    def test_only_selected_fitness_metrics_are_read_and_sent(self):
        result = ShortcutFixture({"Cardio Fitness": VO2_MAX, "Resting Heart Rate": RESTING_HEART_RATE},
            saved=CONFIG, selected=["VO2 max", "Denyut istirahat"], denied=["Body Mass", "Body Fat Percentage"]).run()
        self.assertEqual(result.reads, ["Cardio Fitness", "Resting Heart Rate"])
        self.assertEqual([sample["metric"] for sample in result.requests[0]["samples"]], ["vo2Max", "restingHeartRate"])

    def test_fitness_units_must_be_explicit_and_dimensionally_correct(self):
        for health_type, sample, title, units in [
            ("Cardio Fitness", VO2_MAX, "VO2 max", ["mL/kg/min", "mL/(kg·min)", "ml/(kg*min)"]),
            ("Resting Heart Rate", RESTING_HEART_RATE, "Denyut istirahat", ["bpm", "count/min", "beats/min"]),
        ]:
            for unit in units:
                result = ShortcutFixture({health_type: {**sample, "Unit": unit}}, saved=CONFIG, selected=[title]).run()
                self.assertEqual(result.requests[0]["samples"][0]["value"], sample["Value"])
            result = ShortcutFixture({health_type: {**sample, "Unit": "unknown"}}, saved=CONFIG, selected=[title]).run()
            self.assertEqual(result.requests, [])
            self.assertIn("Satuan", result.alerts[-1])

    def test_both_metrics_one_request_original_independent_dates(self):
        result = ShortcutFixture({"Body Mass": WEIGHT, "Body Fat Percentage": BODY_FAT}, saved=CONFIG).run()
        self.assertEqual(len(result.requests), 1)
        samples = result.requests[0]["samples"]
        self.assertEqual([s["metric"] for s in samples], ["weightKg", "bodyFatPercent"])
        self.assertAlmostEqual(samples[0]["value"], 90, places=3)
        self.assertEqual(samples[0]["measuredAt"], WEIGHT["Start Date"])
        self.assertEqual(samples[1]["measuredAt"], BODY_FAT["Start Date"])
        self.assertEqual(samples[1]["value"], 30.3)
        for sample in samples:
            self.assertIs(type(sample["value"]), float)
        self.assertIsInstance(json.loads(json.dumps(result.requests[0]))["samples"][0]["value"], float)

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
        self.assertIs(type(result.requests[0]["test"]), bool)
        self.assertEqual(json.loads(result.files["connection.json"]), CONFIG)
        self.assertEqual(set(result.files), {"connection.json"})

    def test_failed_configuration_not_saved(self):
        result = ShortcutFixture(config=CONFIG, reject="test").run()
        self.assertEqual(result.files, {})
        self.assertIn("Uji koneksi gagal (response_invalid)", result.alerts[-1])

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
        self.assertIn("Pengiriman pengukuran gagal (response_invalid)", result.alerts[-1])
        self.assertNotIn("pengukuran disimpan", result.alerts[-1])

    def test_safe_error_codes_identify_failed_stage_without_private_response(self):
        for code in ("connection_invalid", "request_invalid", "storage_unavailable", "unexpected-" + CONFIG["token"]):
            for stage, expected_stage in (("test", "Uji koneksi"), ("ingest", "Pengiriman pengukuran")):
                fixture = {"config": CONFIG} if stage == "test" else {"saved": CONFIG}
                result = ShortcutFixture({"Body Mass": WEIGHT}, reject=stage, error_code=code, **fixture).run()
                expected_code = "response_invalid" if code.startswith("unexpected-") else code
                message = result.alerts[-1]
                self.assertIn(f"{expected_stage} gagal ({expected_code})", message)
                self.assertNotIn(CONFIG["token"], message)
                self.assertNotIn(CONFIG["endpoint"], message)
                self.assertNotIn("sensitive synthetic detail", message)
                self.assertNotIn(str(WEIGHT["Value"]), message)

    def test_http_headers_and_url_resolve_to_expected_configuration(self):
        fixture = ShortcutFixture(saved=CONFIG)
        fixture.variables.update(Endpoint=CONFIG["endpoint"], Token=CONFIG["token"])
        workflow = builder.build()
        for action in workflow["WFWorkflowActions"]:
            if action["WFWorkflowActionIdentifier"] != "is.workflow.actions.downloadurl":
                continue
            params = action["WFWorkflowActionParameters"]
            self.assertEqual(fixture.resolve(params["WFURL"]), CONFIG["endpoint"])
            self.assertEqual(fixture.resolve(params["WFHTTPHeaders"]), {
                "Authorization": "Bearer " + CONFIG["token"],
                "Content-Type": "application/json", "Accept": "application/json",
            })

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
