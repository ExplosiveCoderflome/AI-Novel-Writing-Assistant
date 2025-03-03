-- 查找Novel表中的特定ID
SELECT * FROM Novel WHERE id = '6f87de7e-26eb-4754-ada2-3addf7faf5e9';

-- 查找Character表中的特定ID
SELECT * FROM Character WHERE id = '6f87de7e-26eb-4754-ada2-3addf7faf5e9';

-- 查找Chapter表中的特定ID
SELECT * FROM Chapter WHERE id = '6f87de7e-26eb-4754-ada2-3addf7faf5e9';

-- 查找BaseCharacter表中的特定ID
SELECT * FROM BaseCharacter WHERE id = '6f87de7e-26eb-4754-ada2-3addf7faf5e9';

-- 查找User表中的特定ID
SELECT * FROM users WHERE id = '6f87de7e-26eb-4754-ada2-3addf7faf5e9';

-- 查找Novel表中引用这个ID作为authorId的记录
SELECT * FROM Novel WHERE authorId = '6f87de7e-26eb-4754-ada2-3addf7faf5e9';

-- 查找Character表中引用这个ID所属小说的记录
SELECT c.* FROM Character c 
JOIN Novel n ON c.novelId = n.id 
WHERE n.authorId = '6f87de7e-26eb-4754-ada2-3addf7faf5e9';

-- 查找所有小说
SELECT * FROM Novel;

SELECT * FROM NovelGenre;
SELECT * FROM Character;
SELECT * FROM Chapter; 