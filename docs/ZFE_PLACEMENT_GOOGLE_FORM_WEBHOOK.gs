/**
 * ZFE Placement Google Form -> ZE CenterOS
 *
 * SETUP
 * 1) Make the Google Form a Quiz if you want Google to auto-grade objective items.
 * 2) Add a REQUIRED short-answer question titled exactly:
 *      ZE Placement Code
 *    Student copies the code shown inside ZE CenterOS.
 * 3) Open Apps Script from the Form, paste this script.
 * 4) Put your production URL and the same PLACEMENT_WEBHOOK_SECRET used in Vercel.
 * 5) Add trigger: onFormSubmit -> From form -> On form submit.
 *
 * Optional skill sections:
 * If you want CenterOS to receive separate L/R/W values, add scored items whose
 * titles start with [L], [R], [W]. This script sums each section and converts
 * section percentages to IELTS-like 0-9 display values. Adjust mapping if your
 * placement test uses another scoring scheme.
 */

const CENTEROS_URL = "https://YOUR-CENTEROS-DOMAIN/api/placement/google-form-webhook";
const CENTEROS_SECRET = "PASTE_THE_SAME_PLACEMENT_WEBHOOK_SECRET_HERE";
const TOKEN_QUESTION = "ZE Placement Code";

function onFormSubmit(e) {
  const response = e.response;
  const itemResponses = response.getGradableItemResponses();
  let token = "";
  let totalScore = 0;
  let maxScore = 0;
  const sections = {L:{score:0,max:0},R:{score:0,max:0},W:{score:0,max:0}};
  const answers = {};

  itemResponses.forEach(function(ir) {
    const item = ir.getItem();
    const title = item.getTitle();
    const answer = ir.getResponse();
    answers[title] = answer;

    if (title === TOKEN_QUESTION) token = String(answer || "").trim();

    const score = Number(ir.getScore() || 0);
    // Apps Script does not expose max score uniformly for every item type.
    // For Quiz items, use item.asMultipleChoiceItem etc if you need exact max.
    // Here we treat a non-null score as collected; configure SECTION_MAX below
    // if you use separate L/R/W calculations.
    totalScore += score;

    if (title.indexOf("[L]") === 0) sections.L.score += score;
    if (title.indexOf("[R]") === 0) sections.R.score += score;
    if (title.indexOf("[W]") === 0) sections.W.score += score;
  });

  // Configure to the actual maximum points of your Form quiz.
  const FORM_MAX_SCORE = 100;
  const SECTION_MAX = {L:40,R:40,W:20};
  maxScore = FORM_MAX_SCORE;

  const toBand = function(score, max) {
    if (!max) return null;
    return Math.round((score / max * 9) * 2) / 2;
  };

  if (!token) throw new Error("Missing ZE Placement Code in form response.");

  const payload = {
    external_token: token,
    response_id: response.getId(),
    submitted_at: response.getTimestamp().toISOString(),
    objective_score: totalScore,
    max_score: maxScore,
    listening_score: toBand(sections.L.score, SECTION_MAX.L),
    reading_score: toBand(sections.R.score, SECTION_MAX.R),
    writing_score: toBand(sections.W.score, SECTION_MAX.W),
    answers: answers
  };

  UrlFetchApp.fetch(CENTEROS_URL, {
    method: "post",
    contentType: "application/json",
    headers: {"x-ze-placement-secret": CENTEROS_SECRET},
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}
