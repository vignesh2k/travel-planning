from api.llm.pdf_plan import PDF_PLAN_MODEL


def test_pdf_plan_default_model_does_not_force_web_search() -> None:
    assert PDF_PLAN_MODEL == "deepseek/deepseek-v4-flash"
    assert ":online" not in PDF_PLAN_MODEL
