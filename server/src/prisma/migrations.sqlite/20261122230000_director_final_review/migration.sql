CREATE TABLE "DirectorFinalChapterCheck" (
  "chapterId" TEXT NOT NULL REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sourceHash" TEXT NOT NULL,
  "findingsJson" TEXT NOT NULL,
  PRIMARY KEY ("chapterId", "sourceHash")
);

CREATE TABLE "DirectorFinalApproval" (
  "novelId" TEXT NOT NULL PRIMARY KEY REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "confirmedVersion" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL
);
