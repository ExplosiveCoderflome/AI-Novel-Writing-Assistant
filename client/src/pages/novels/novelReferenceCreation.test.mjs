import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultNovelBasicFormState,
  patchNovelBasicForm,
} from "./novelBasicInfo.shared.ts";

const sections = ["overview", "plot_structure", "timeline"];

test("one-click continuation keeps its source and analysis when applied together", () => {
  const form = patchNovelBasicForm(createDefaultNovelBasicFormState(), {
    writingMode: "continuation",
    continuationSourceType: "knowledge_document",
    sourceKnowledgeDocumentId: "document-1",
    continuationBookAnalysisId: "analysis-1",
    continuationBookAnalysisSections: sections,
  });

  assert.equal(form.writingMode, "continuation");
  assert.equal(form.sourceKnowledgeDocumentId, "document-1");
  assert.equal(form.continuationBookAnalysisId, "analysis-1");
  assert.deepEqual(form.continuationBookAnalysisSections, sections);
  assert.equal(form.referenceBookAnalysisId, "");
});

test("reference-based original creation keeps structure reference and clears continuation fields", () => {
  const continuation = patchNovelBasicForm(createDefaultNovelBasicFormState(), {
    writingMode: "continuation",
    continuationSourceType: "knowledge_document",
    sourceKnowledgeDocumentId: "document-1",
    continuationBookAnalysisId: "analysis-1",
  });
  const form = patchNovelBasicForm(continuation, {
    writingMode: "original",
    referenceBookAnalysisId: "analysis-1",
    referenceBookAnalysisSections: sections,
  });

  assert.equal(form.writingMode, "original");
  assert.equal(form.sourceKnowledgeDocumentId, "");
  assert.equal(form.continuationBookAnalysisId, "");
  assert.equal(form.referenceBookAnalysisId, "analysis-1");
  assert.deepEqual(form.referenceBookAnalysisSections, sections);
});
