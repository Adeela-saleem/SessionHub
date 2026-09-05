-- CreateTable
CREATE TABLE "saved_quizzes" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "questions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_quizzes_teacherId_idx" ON "saved_quizzes"("teacherId");

-- AddForeignKey
ALTER TABLE "saved_quizzes" ADD CONSTRAINT "saved_quizzes_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
