from pathlib import Path
import unittest


WORKFLOW = Path(__file__).parents[2] / ".github" / "workflows" / "aperture-research-nightly.yml"


class ResearchWorkflowTests(unittest.TestCase):
    def test_nightly_workflow_is_secret_scoped_non_promoting_and_app_isolated(self):
        source = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("secrets.APCA_API_KEY_ID", source)
        self.assertIn("secrets.APCA_API_SECRET_KEY", source)
        self.assertIn("python -m unittest discover", source)
        self.assertIn("strictGateEligible", source)
        self.assertIn("promotionDecision", source)
        self.assertIn("NOT_PERFORMED", source)
        self.assertIn("applicationWriteAttempted", source)
        self.assertIn("actions/checkout@11d5960a326750d5838078e36cf38b85af677262", source)
        self.assertIn("actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065", source)
        self.assertIn("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02", source)
        self.assertNotIn("uses: actions/checkout@v", source)
        self.assertNotIn("uses: actions/setup-python@v", source)
        self.assertNotIn("uses: actions/upload-artifact@v", source)
        jobs_before_steps = source.split("steps:", 1)[0]
        self.assertNotIn("APCA_API_KEY_ID", jobs_before_steps)
        publish = source.split("- name: Publish aggregate non-entitled artifacts", 1)[1]
        publish = publish.split("- name: Publish non-actionable run summary", 1)[0]
        self.assertNotIn("/archive", publish)
        self.assertNotIn("alpaca-proxy-rows.jsonl", publish)
        self.assertIn("alpaca-proxy-report.json", publish)
        self.assertIn("research-health.json", publish)
        self.assertNotIn("/api/", source)
        self.assertNotIn("PAPER_COMMAND_SECRET", source)
        self.assertNotIn("CLOUDFLARE_API_TOKEN", source)
        self.assertNotIn("wrangler", source.lower())


if __name__ == "__main__":
    unittest.main()
