#!/usr/bin/env python3
"""Exercise generic native templates with synthetic inputs, not iOS emulation."""
import copy
import importlib.util
import json
from pathlib import Path
import plistlib
import re
import sys
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("native_shortcuts", Path(__file__).with_name("native-health-shortcuts.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

CONFIG = {"endpoint": "https://menuju-kurus.vercel.app/api/health-sync", "token": "synthetic-test-token"}
CONFIG_PATH = "/Slothly/connection.json"
PAIRING = {"redeemUrl": "https://menuju-kurus.vercel.app/api/health-pairing/redeem", "code": "synthetic-one-use-code"}
DATE = "2026-10-25T11:19:00+07:00"
# Synthetic Health fixtures specify native unit strings independently of the
# generator's patterns. Per-sample overrides exercise mixed/unsupported units.
HEALTH_UNITS = {"Weight": "kg", "Body Fat Percentage": "%", "Resting Heart Rate": "count/min",
                "VO2 Max": "mL/(kg*min)", "Active Calories": "kcal"}


class Fixture:
    def __init__(self, kind, config=None, samples=None, response=None, incoming=None, files=None,
                 redeem_response=None, test_response=None, cancel_pairing=False):
        self.kind, self.config = kind, CONFIG if config is None else config
        self.samples, self.response = samples or {}, response or {"status": "ok", "ok": True}
        self.incoming = json.dumps(incoming) if isinstance(incoming, dict) else incoming
        self.files = {CONFIG_PATH: json.dumps(self.config)} if files is None else files
        self.redeem_response = {"status": "paired", "accountName": "Synthetic Account", **CONFIG} if redeem_response is None else redeem_response
        self.test_response = {"status": "tested", "tested": True} if test_response is None else test_response
        self.outputs, self.variables, self.posts, self.requests, self.queries, self.alerts = {}, {}, [], [], [], []
        self.confirmations, self.cancel_pairing = [], cancel_pairing

    def attachment(self, item):
        if item["Type"] == "ExtensionInput":
            return self.incoming
        return self.variables.get(item["VariableName"]) if item["Type"] == "Variable" else self.outputs[item["OutputUUID"]]

    def resolve(self, value):
        if not isinstance(value, dict):
            return value
        kind, state = value.get("WFSerializationType"), value.get("Value")
        if kind == "WFTextTokenAttachment":
            return self.attachment(state)
        if kind == "WFTextTokenString":
            string = state["string"]
            if string == "\ufffc":
                return self.attachment(next(iter(state["attachmentsByRange"].values())))
            for key, attached in reversed(list(state.get("attachmentsByRange", {}).items())):
                offset = int(key.split(",")[0][1:])
                string = string[:offset] + str(self.attachment(attached) or "") + string[offset + 1:]
            return string
        if kind == "WFDictionaryFieldValue":
            if "WFSerializationType" in state:
                return self.resolve(state)
            result = {}
            for field in state["WFDictionaryFieldValueItems"]:
                row_type = field["WFItemType"]
                key = str(self.resolve(field["WFKey"]))
                content = self.resolve(field["WFValue"])
                result[key] = float(content) if row_type == 3 else content
            return result
        if kind == "WFArrayParameterState":
            return [self.resolve(item["WFValue"]) for item in state]
        if kind == "WFNumberSubstitutableState":
            return bool(state)
        raise AssertionError("Unknown wire structure")

    def condition(self, params):
        value = self.resolve(params["WFInput"]["Variable"])
        code = params["WFCondition"]
        if code in (100, 101):
            present = value is not None and value != "" and value != []
            return present if code == 100 else not present
        expected = params.get("WFConditionalActionString", params.get("WFNumberValue"))
        return str(value) == str(expected) if code == 4 else str(value) != str(expected)

    def run(self, workflow=None):
        workflow = builder.build(self.kind) if workflow is None else workflow
        builder.validate(workflow, self.kind)
        stack = []
        for index, action in enumerate(workflow["WFWorkflowActions"]):
            kind = action["WFWorkflowActionIdentifier"].removeprefix("is.workflow.actions.")
            params = action["WFWorkflowActionParameters"]
            active = all(frame["active"] for frame in stack)
            if kind == "conditional":
                mode = params["WFControlFlowMode"]
                if mode == 0:
                    matches = self.condition(params) if active else False
                    stack.append({"parent": active, "matches": matches, "active": active and matches})
                elif mode == 1:
                    stack[-1]["active"] = stack[-1]["parent"] and not stack[-1]["matches"]
                else:
                    stack.pop()
                continue
            if not active:
                continue
            result = None
            if kind in ("comment", "nothing"):
                pass
            elif kind == "gettext":
                result = self.resolve(params["WFTextActionText"])
                if isinstance(result, dict):
                    result = json.dumps(result)
            elif kind == "detect.dictionary":
                value = self.resolve(params["WFInput"])
                result = value if isinstance(value, dict) else json.loads(value)
            elif kind == "dictionary":
                result = self.resolve(params["WFItems"])
            elif kind == "getvalueforkey":
                result = self.resolve(params["WFInput"]).get(params["WFDictionaryKey"])
            elif kind == "setvariable":
                self.variables[params["WFVariableName"]] = self.resolve(params["WFInput"])
            elif kind == "text.match":
                result = re.findall(params["WFMatchTextPattern"], str(self.resolve(params["text"]) or ""))
            elif kind == "text.combine":
                parts = self.resolve(params["text"])
                result = "\n".join(str(part) for part in parts) if isinstance(parts, list) else str(parts)
            elif kind == "filter.health.quantity":
                health_type = params["WFContentItemFilter"]["Value"]["WFActionParameterFilterTemplates"][0]["Values"]["Enumeration"]["Value"]
                self.queries.append(health_type)
                result = [{"Unit": HEALTH_UNITS[health_type], **sample} for sample in self.samples.get(health_type, [])]
                if params.get("WFContentItemLimitEnabled"):
                    result = sorted(result, key=lambda s: s["Start Date"], reverse=True)[:1]
            elif kind == "count":
                result = len(self.resolve(params["Input"]))
            elif kind == "properties.health.quantity":
                found = self.resolve(params["WFInput"])
                values = [sample[params["WFContentItemPropertyName"]] for sample in found]
                result = values[0] if len(values) == 1 else values
            elif kind == "format.date":
                self.assert_iso(params)
                result = self.resolve(params["WFDate"])
            elif kind == "statistics":
                values = self.resolve(params["Input"])
                result = sum(values if isinstance(values, list) else [values])
            elif kind == "downloadurl":
                request = {"url": self.resolve(params["WFURL"]), "headers": self.resolve(params["WFHTTPHeaders"]),
                           "body": self.resolve(params["WFJSONValues"])}
                self.requests.append(request)
                if params["UUID"] == builder.wire.uid(self.kind + "-redeem"):
                    result = self.redeem_response
                elif params["UUID"] == builder.wire.uid(self.kind + "-test"):
                    result = self.test_response
                else:
                    self.posts.append(request)
                    result = self.response
            elif kind == "documentpicker.open":
                result = self.files.get(params["WFGetFilePath"])
            elif kind == "file.createfolder":
                pass
            elif kind == "setitemname":
                result = self.resolve(params["WFInput"])
            elif kind == "documentpicker.save":
                self.files[CONFIG_PATH] = self.resolve(params["WFInput"])
                result = self.files[CONFIG_PATH]
            elif kind == "alert":
                message = self.resolve(params["WFAlertActionMessage"])
                if params.get("WFAlertActionCancelButtonShown"):
                    self.confirmations.append(message)
                    if self.cancel_pairing:
                        break
                else:
                    self.alerts.append(message)
            elif kind == "exit":
                break
            else:
                raise AssertionError(kind)
            if "UUID" in params:
                self.outputs[params["UUID"]] = result
        return self

    @staticmethod
    def assert_iso(params):
        assert params["WFDateFormatStyle"] == "ISO 8601" and params["WFISO8601IncludeTime"] is True


class NativeTemplateTests(unittest.TestCase):
    def test_templates_validate_round_trip_and_stay_small(self):
        for kind in builder.KINDS:
            workflow = builder.build(kind)
            builder.validate(plistlib.loads(plistlib.dumps(workflow)), kind)
            self.assertLess(len(workflow["WFWorkflowActions"]), 160)

    def test_native_queries_counts_values_and_conditions_are_preserved(self):
        for kind in builder.KINDS:
            built = builder.build(kind)["WFWorkflowActions"]
            for action in builder.native(kind)["WFWorkflowActions"]:
                if not action["WFWorkflowActionIdentifier"].endswith(".downloadurl"):
                    self.assertIn(action, built)

    def test_runtime_pairing_has_no_import_questions_clipboard_or_interactive_picker(self):
        for kind in builder.KINDS:
            workflow = builder.build(kind)
            self.assertEqual(workflow["WFWorkflowImportQuestions"], [])
            self.assertTrue(workflow["WFWorkflowHasShortcutInputVariables"])
            kinds = [a["WFWorkflowActionIdentifier"].removeprefix("is.workflow.actions.") for a in workflow["WFWorkflowActions"]]
            self.assertNotIn("getclipboard", kinds)
            self.assertNotIn("setclipboard", kinds)
            self.assertNotIn("ask", kinds)
            self.assertNotIn("choosefromlist", kinds)
            for action in workflow["WFWorkflowActions"]:
                if action["WFWorkflowActionIdentifier"].endswith(".alert"):
                    self.assertNotIn("Salin konfigurasi", str(action["WFWorkflowActionParameters"]))
                if action["WFWorkflowActionIdentifier"].endswith(".documentpicker.save"):
                    self.assertFalse(action["WFWorkflowActionParameters"]["WFAskWhereToSave"])

    def test_pairing_redeems_without_bearer_tests_then_saves_only_private_config(self):
        fixture = Fixture("berat", incoming=PAIRING, files={}).run()
        self.assertEqual([r["url"] for r in fixture.requests], [PAIRING["redeemUrl"], CONFIG["endpoint"]])
        self.assertEqual(fixture.requests[0]["body"], {"code": PAIRING["code"]})
        self.assertNotIn("Authorization", fixture.requests[0]["headers"])
        self.assertEqual(fixture.requests[1]["body"], {"provider": "apple_health", "test": True})
        self.assertEqual(json.loads(fixture.files[CONFIG_PATH]), CONFIG)
        self.assertNotIn(PAIRING["code"], fixture.files[CONFIG_PATH])
        self.assertEqual(fixture.queries, ["Weight", "Body Fat Percentage"])
        self.assertEqual(len(fixture.confirmations), 1)
        self.assertIn("Synthetic Account", fixture.confirmations[0])
        self.assertNotIn(CONFIG["token"], fixture.confirmations[0])

    def test_missing_shared_config_stops_before_network_and_health(self):
        fixture = Fixture("watch", files={}).run()
        self.assertEqual(fixture.requests, [])
        self.assertEqual(fixture.queries, [])
        self.assertEqual(len(fixture.alerts), 1)
        self.assertIn("Hubungkan akun", fixture.alerts[0])

    def test_berat_pairing_config_is_reused_by_watch_without_pairing_again(self):
        first = Fixture("berat", incoming=PAIRING, files={}).run()
        second = Fixture("watch", files=first.files, samples={"Resting Heart Rate": [{"Value": 62, "Start Date": DATE}]}).run()
        self.assertEqual(len(second.requests), 1)
        self.assertEqual(second.requests[0]["headers"]["Authorization"], "Bearer " + CONFIG["token"])
        self.assertEqual(second.requests[0]["body"]["samples"][0]["metric"], "restingHeartRate")

    def test_failed_redeem_or_connection_test_never_replaces_old_file_or_reads_health(self):
        for failure in ("redeem", "test"):
            old = json.dumps({"endpoint": CONFIG["endpoint"], "token": "synthetic-old-token"})
            args = {"redeem_response": {"status": "error", "error": "private-error-sentinel"}} if failure == "redeem" else {
                "test_response": {"status": "error", "error": "private-error-sentinel"}}
            fixture = Fixture("berat", incoming=PAIRING, files={CONFIG_PATH: old}, **args).run()
            self.assertEqual(fixture.files[CONFIG_PATH], old)
            self.assertEqual(fixture.queries, [])
            self.assertEqual(len(fixture.requests), 1 if failure == "redeem" else 2)
            self.assertEqual(len(fixture.alerts), 1)
            self.assertNotIn("private-error-sentinel", fixture.alerts[0])
            self.assertNotIn(CONFIG["token"], fixture.alerts[0])

    def test_pairing_requires_https_exact_path_and_code_before_network(self):
        for value in ({}, {"redeemUrl": PAIRING["redeemUrl"]}, {"redeemUrl": "http://example.invalid/api/health-pairing/redeem", "code": "synthetic"},
                      {"redeemUrl": "https://example.invalid/wrong", "code": "synthetic"}):
            fixture = Fixture("watch", incoming=value, files={}).run()
            self.assertEqual(fixture.requests, [])
            self.assertEqual(fixture.queries, [])
            self.assertEqual(fixture.files, {})

    def test_paired_response_requires_valid_config_before_test_or_overwrite(self):
        for response in ({"status": "paired", "endpoint": CONFIG["endpoint"]},
                         {"status": "paired", "endpoint": "http://example.invalid/api/health-sync", "token": "synthetic"},
                         {"status": "paired", "endpoint": "https://example.invalid/wrong", "token": "synthetic"}):
            old = json.dumps({"endpoint": CONFIG["endpoint"], "token": "synthetic-old-token"})
            fixture = Fixture("berat", incoming=PAIRING, files={CONFIG_PATH: old}, redeem_response=response).run()
            self.assertEqual(fixture.files[CONFIG_PATH], old)
            self.assertEqual(len(fixture.requests), 1)
            self.assertEqual(fixture.queries, [])
            self.assertEqual(len(fixture.alerts), 1)

    def test_untrusted_redeem_host_is_blocked_before_any_network(self):
        fixture = Fixture("berat", incoming={**PAIRING, "redeemUrl": "https://attacker.invalid/api/health-pairing/redeem"}, files={}).run()
        self.assertEqual(fixture.requests, [])
        self.assertEqual(fixture.queries, [])
        self.assertEqual(fixture.files, {})

    def test_wrong_returned_endpoint_is_blocked_before_test_confirm_or_save(self):
        old = json.dumps(CONFIG)
        fixture = Fixture("berat", incoming=PAIRING, files={CONFIG_PATH: old}, redeem_response={
            "status": "paired", "accountName": "Synthetic Account", "endpoint": "https://attacker.invalid/api/health-sync", "token": "synthetic"}).run()
        self.assertEqual(len(fixture.requests), 1)
        self.assertEqual(fixture.queries, [])
        self.assertEqual(fixture.files[CONFIG_PATH], old)
        self.assertEqual(fixture.confirmations, [])

    def test_canceling_account_confirmation_keeps_old_config_and_reads_no_health(self):
        old = json.dumps({**CONFIG, "token": "synthetic-old-token"})
        fixture = Fixture("berat", incoming=PAIRING, files={CONFIG_PATH: old}, cancel_pairing=True).run()
        self.assertEqual(len(fixture.requests), 1)
        self.assertEqual(fixture.files[CONFIG_PATH], old)
        self.assertEqual(fixture.queries, [])
        self.assertEqual(len(fixture.confirmations), 1)

    def test_missing_verified_account_name_stops_before_confirmation_or_health(self):
        fixture = Fixture("berat", incoming=PAIRING, files={}, redeem_response={"status": "paired", **CONFIG}).run()
        self.assertEqual(len(fixture.requests), 1)
        self.assertEqual(fixture.files, {})
        self.assertEqual(fixture.queries, [])
        self.assertEqual(fixture.confirmations, [])

    def test_downloaded_basename_matches_the_installed_display_name(self):
        for kind, name in (("berat", "Slothly Berat"), ("watch", "Slothly Watch")):
            self.assertEqual(builder.download_filename(kind), name + ".shortcut")
            self.assertEqual(builder.build(kind)["WFWorkflowName"], name)
            self.assertEqual(builder.install_path(kind), "/shortcuts/" + name.replace(" ", "%20") + ".shortcut")

    def test_weight_and_fat_send_numbers_with_original_measurement_dates(self):
        fixture = Fixture("berat", samples={"Weight": [{"Value": 92.3, "Start Date": DATE}],
            "Body Fat Percentage": [{"Value": 30.5, "Start Date": "2026-10-24T05:00:00Z"}]}).run()
        self.assertEqual(len(fixture.posts), 2)
        values = [post["body"]["samples"][0] for post in fixture.posts]
        self.assertEqual(values, [{"metric": "weightKg", "value": 92.3, "measuredAt": DATE},
            {"metric": "bodyFatPercent", "value": 30.5, "measuredAt": "2026-10-24T05:00:00Z"}])
        self.assertTrue(all(isinstance(value["value"], float) for value in values))

    def test_watch_corrects_auth_and_vo2_key_and_keeps_daily_energy_sum(self):
        fixture = Fixture("watch", samples={"Resting Heart Rate": [{"Value": 63, "Start Date": DATE}],
            "VO2 Max": [{"Value": 39.5, "Start Date": DATE}], "Active Calories": [
                {"Value": 50.4, "Start Date": DATE}, {"Value": 120.6, "Start Date": DATE}]}).run()
        self.assertEqual(len(fixture.posts), 3)
        self.assertEqual(fixture.posts[1]["body"]["samples"][0]["metric"], "vo2Max")
        self.assertEqual(fixture.posts[2]["body"], {"calories": 171.0, "provider": "apple_health"})
        for post in fixture.posts:
            self.assertEqual(post["headers"]["Authorization"], "Bearer synthetic-test-token")
            self.assertNotIn("Authorisation", post["headers"])
            self.assertEqual(post["url"], CONFIG["endpoint"])
        energy = [a for a in builder.build("watch")["WFWorkflowActions"] if a["WFWorkflowActionIdentifier"].endswith(".filter.health.quantity")][-1]
        self.assertEqual(energy["WFWorkflowActionParameters"]["WFContentItemFilter"]["Value"]["WFActionParameterFilterTemplates"][1]["Operator"], 1002)

    def test_weight_in_pounds_is_stopped_before_any_post(self):
        fixture = Fixture("berat", samples={"Weight": [{"Value": 205, "Unit": "lb", "Start Date": DATE}]}).run()
        self.assertEqual(fixture.posts, [])
        self.assertIn("kg", fixture.alerts[0])
        self.assertEqual(fixture.queries, ["Weight"])

    def test_energy_kilojoules_and_mixed_units_never_post_a_calorie_value(self):
        for units in (["kJ"], ["kcal", "kJ"], ["kcal", "cal"], ["calories"]):
            fixture = Fixture("watch", samples={"Active Calories": [
                {"Value": 100, "Unit": unit, "Start Date": DATE} for unit in units]}).run()
            self.assertEqual(fixture.posts, [])
            self.assertIn("kcal", fixture.alerts[0])

    def test_recognized_native_units_do_not_change_values(self):
        fixture = Fixture("berat", samples={"Weight": [{"Value": 93.4, "Unit": "kilograms", "Start Date": DATE}],
            "Body Fat Percentage": [{"Value": 31.6, "Unit": "%", "Start Date": DATE}]}).run()
        self.assertEqual([p["body"]["samples"][0]["value"] for p in fixture.posts], [93.4, 31.6])
        for unit in ("mL/(kg*min)", "mL/kg/min", "mL/(kg·min)"):
            fixture = Fixture("watch", samples={"VO2 Max": [{"Value": 42, "Unit": unit, "Start Date": DATE}]}).run()
            self.assertEqual(fixture.posts[0]["body"]["samples"][0]["value"], 42)
        fixture = Fixture("watch", samples={"Resting Heart Rate": [{"Value": 62, "Unit": "bpm", "Start Date": DATE}],
            "Active Calories": [{"Value": 50, "Unit": "kilocalories", "Start Date": DATE},
                                {"Value": 25, "Unit": "kcal", "Start Date": DATE}]}).run()
        self.assertEqual(fixture.posts[0]["body"]["samples"][0]["value"], 62)
        self.assertEqual(fixture.posts[1]["body"]["calories"], 75)

    def test_unknown_fat_fitness_and_resting_heart_units_are_stopped(self):
        for kind, health_type in (("berat", "Body Fat Percentage"), ("watch", "VO2 Max"), ("watch", "Resting Heart Rate")):
            fixture = Fixture(kind, samples={health_type: [{"Value": 32, "Unit": "unsupported", "Start Date": DATE}]}).run()
            self.assertEqual(fixture.posts, [])
            self.assertEqual(len(fixture.alerts), 1)

    def test_missing_measurement_skips_only_that_request_and_never_sends_zero(self):
        fixture = Fixture("berat", samples={"Body Fat Percentage": [{"Value": 29.2, "Start Date": DATE}]}).run()
        self.assertEqual(len(fixture.posts), 1)
        self.assertEqual(fixture.posts[0]["body"]["samples"][0]["metric"], "bodyFatPercent")
        self.assertEqual(Fixture("watch").run().posts, [])

    def test_configuration_validation_stops_before_health_queries(self):
        for config in ({}, {"endpoint": CONFIG["endpoint"]}, {"endpoint": "http://example.invalid/api/health-sync", "token": "synthetic"},
                       {"endpoint": "https://example.invalid/wrong", "token": "synthetic"}):
            fixture = Fixture("berat", config=config).run()
            self.assertEqual(fixture.queries, [])
            self.assertEqual(fixture.posts, [])
            self.assertEqual(len(fixture.alerts), 1)

    def test_api_error_stops_remaining_requests(self):
        fixture = Fixture("berat", samples={"Weight": [{"Value": 90, "Start Date": DATE}],
            "Body Fat Percentage": [{"Value": 30, "Start Date": DATE}]}, response={"status": "error", "code": "connection_invalid"}).run()
        self.assertEqual(fixture.queries, ["Weight"])
        self.assertEqual(len(fixture.posts), 1)
        self.assertEqual(len(fixture.alerts), 1)

    def test_validator_rejects_changed_query_credential_or_unknown_reference(self):
        for mutation in ("query", "secret", "reference"):
            workflow = copy.deepcopy(builder.build("berat"))
            if mutation == "query":
                action = next(a for a in workflow["WFWorkflowActions"] if a["WFWorkflowActionIdentifier"].endswith(".filter.health.quantity"))
                action["WFWorkflowActionParameters"]["WFContentItemLimitNumber"] = 3
            elif mutation == "secret":
                workflow["WFWorkflowActions"][0]["WFWorkflowActionParameters"]["WFCommentActionText"] = "Bearer synthetic-leak"
            else:
                action = next(a for a in workflow["WFWorkflowActions"] if a["WFWorkflowActionIdentifier"].endswith(".count"))
                action["WFWorkflowActionParameters"]["Input"]["Value"]["OutputUUID"] = "missing"
            with self.assertRaises(AssertionError):
                builder.validate(workflow, "berat")


if __name__ == "__main__":
    unittest.main()
