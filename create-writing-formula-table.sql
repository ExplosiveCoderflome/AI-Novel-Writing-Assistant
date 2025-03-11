-- 创建写作公式表
CREATE TABLE IF NOT EXISTS writing_formulas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sourceText TEXT NOT NULL,
  genre TEXT,
  style TEXT,
  toneVoice TEXT,
  structure TEXT,
  pacing TEXT,
  paragraphPattern TEXT,
  sentenceStructure TEXT,
  vocabularyLevel TEXT,
  rhetoricalDevices TEXT,
  narrativeMode TEXT,
  perspectivePoint TEXT,
  characterVoice TEXT,
  themes TEXT,
  motifs TEXT,
  emotionalTone TEXT,
  uniqueFeatures TEXT,
  formulaDescription TEXT,
  formulaSteps TEXT,
  applicationTips TEXT,
  userId TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_writing_formulas_userId ON writing_formulas(userId); 