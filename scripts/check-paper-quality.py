"""Check manual cutouts and reject the known almost-opaque QA delivery."""
import json
from PIL import Image
from niuma import ROOT,RUNTIME,save,now
from paper_assets import validate,prepare
from paper_generate import require_isolated
manual = {name:validate(ROOT/f"packages/nextjs/public/employees/{name}.png") for name in ["mule","alpaca","programmer"]}
try:
    validate(RUNTIME/"orders/9/character.png")
    raise AssertionError("Known bad background was accepted")
except ValueError as error: rejection=str(error)
report=dict(at=now(), manualCutouts=manual, rejectedOldQaOrder9=rejection, status="PASS_MANUAL_AND_REJECTION_CHECK")
try:
    require_isolated(validate(RUNTIME/"rembg-qa.png"))
    raise AssertionError("Known board-shaped rembg result was accepted")
except ValueError as error: report["rejectedBoardShapedRembg"] = str(error)
save(ROOT/"evidence/paper-quality-check.json",report)
print(json.dumps(report,ensure_ascii=False))
