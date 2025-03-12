-- 添加content字段到writing_formulas表
ALTER TABLE writing_formulas ADD content TEXT;

-- 更新现有记录，将formulaDescription内容填充到content字段
UPDATE writing_formulas
SET content = formulaDescription
WHERE content IS NULL AND formulaDescription IS NOT NULL; 