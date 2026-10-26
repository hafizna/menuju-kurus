#!/usr/bin/env python3
"""Synthetic checks for the separate diagnostic; does not emulate iOS permissions."""
import copy
import importlib.util
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("read_check", Path(__file__).with_name("health-read-check.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

# Independent factual parameter evidence from actual exported Apple actions,
# Federico Viticci / MacStories, MIT (2026): Count UUID B18B0452... in
# https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/golden-shortcuts/xml/51cc4e26d1044893a0c3f2f3630cf2d2.xml
# uses capital-I Input; count UUID E5571204... in 332c12a...xml uses Items.
# Nothing is exported with an empty parameter dictionary in both workflows.
# Only the factual key names/type label are retained here, not program code.
EXPORTED_COUNT_INPUT_KEY = "Input"
EXPORTED_COUNT_ITEMS_TYPE = "Items"


class Fixture:
    def __init__(self, samples=None, denied=False):
        self.samples = samples or []
        self.denied = denied
        self.outputs, self.alerts = {}, []

    def resolve(self, value):
        if not isinstance(value, dict):
            return value
        if value.get("WFSerializationType") == "WFTextTokenAttachment":
            return self.outputs[value["Value"]["OutputUUID"]]
        if value.get("WFSerializationType") == "WFTextTokenString":
            state = value["Value"]
            result = state["string"]
            for key, attachment in reversed(list(state.get("attachmentsByRange", {}).items())):
                index = int(key.split(",")[0][1:])
                result = result[:index] + str(self.outputs[attachment["OutputUUID"]]) + result[index + 1:]
            return result
        raise AssertionError("Unknown wire format")

    def run(self, workflow=None):
        workflow = workflow if workflow is not None else builder.build()
        builder.validate(workflow)
        active, has_sample = True, False
        for action in workflow["WFWorkflowActions"]:
            kind = action["WFWorkflowActionIdentifier"].removeprefix("is.workflow.actions.")
            params = action["WFWorkflowActionParameters"]
            if kind == "conditional":
                mode = params["WFControlFlowMode"]
                if mode == 0:
                    assert params["WFCondition"] == 2
                    has_sample = float(self.resolve(params["WFInput"]["Variable"])) > float(params["WFNumberValue"])
                    active = has_sample
                else:
                    active = not has_sample if mode == 1 else True
                continue
            if not active:
                continue
            result = None
            if kind in ("comment", "nothing"):
                pass
            elif kind == "filter.health.quantity":
                if self.denied:
                    raise PermissionError("Synthetic native Health error")
                result = sorted(self.samples, key=lambda sample: sample["Start Date"], reverse=True)[:1]
            elif kind == "count":
                assert params["WFCountType"] == EXPORTED_COUNT_ITEMS_TYPE
                assert "WFInput" not in params
                result = len(self.resolve(params[EXPORTED_COUNT_INPUT_KEY]))
            elif kind == "properties.health.quantity":
                assert params["WFContentItemPropertyName"] == "Start Date"
                result = self.resolve(params["WFInput"])[0]["Start Date"]
            elif kind == "format.date":
                assert params["WFDateFormatStyle"] == "ISO 8601" and params["WFISO8601IncludeTime"] is True
                result = self.resolve(params["WFDate"])
            elif kind == "alert":
                self.alerts.append(self.resolve(params["WFAlertActionMessage"]))
            else:
                raise AssertionError(kind)
            self.outputs[params["UUID"]] = result
        return self


class DiagnosticTests(unittest.TestCase):
    def test_only_local_read_actions_and_no_external_input(self):
        workflow = builder.build()
        builder.validate(workflow)
        self.assertEqual(workflow["WFWorkflowInputContentItemClasses"], [])
        kinds = [action["WFWorkflowActionIdentifier"] for action in workflow["WFWorkflowActions"]]
        self.assertEqual(kinds[1:4], ["is.workflow.actions.nothing", "is.workflow.actions.filter.health.quantity", "is.workflow.actions.count"])
        self.assertEqual(sum(kind.endswith(".filter.health.quantity") for kind in kinds), 1)

    def test_one_sample_shows_count_and_original_date_but_no_value(self):
        fixture = Fixture([{"Start Date": "2021-06-14T18:19:00+07:00", "Value": "private-synthetic-weight"}]).run()
        self.assertEqual(len(fixture.alerts), 1)
        self.assertIn("terbaca: 1", fixture.alerts[0])
        self.assertIn("2021-06-14T18:19:00+07:00", fixture.alerts[0])
        self.assertNotIn("private-synthetic-weight", fixture.alerts[0])
        self.assertIn("Belum ada data yang dikirim", fixture.alerts[0])

    def test_zero_samples_does_not_assign_permission_cause(self):
        fixture = Fixture().run()
        self.assertIn("terbaca: 0", fixture.alerts[0])
        self.assertIn("Penyebabnya belum diketahui", fixture.alerts[0])
        self.assertNotIn("Tanggal pengukuran terbaru", fixture.alerts[0])

    def test_native_permission_error_is_not_claimed_to_be_caught(self):
        fixture = Fixture(denied=True)
        with self.assertRaises(PermissionError):
            fixture.run()
        self.assertEqual(fixture.alerts, [])

    def test_count_uses_actual_exported_input_not_wfinput(self):
        workflow = copy.deepcopy(builder.build())
        count = next(action["WFWorkflowActionParameters"] for action in workflow["WFWorkflowActions"] if action["WFWorkflowActionIdentifier"].endswith(".count"))
        self.assertIn(EXPORTED_COUNT_INPUT_KEY, count)
        count["WFInput"] = count.pop(EXPORTED_COUNT_INPUT_KEY)
        with self.assertRaises(AssertionError):
            builder.validate(workflow)

    def test_validator_rejects_network_or_file_or_health_write(self):
        for kind in ("downloadurl", "documentpicker.save", "health.quantity.log", "getclipboard", "setclipboard"):
            workflow = copy.deepcopy(builder.build())
            workflow["WFWorkflowActions"][1]["WFWorkflowActionIdentifier"] = "is.workflow.actions." + kind
            with self.assertRaises(AssertionError):
                builder.validate(workflow)


if __name__ == "__main__":
    unittest.main()
