/*
  Warnings:

  - The primary key for the `Document` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `content` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `datasetId` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `deletedAt` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `embedding` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `projectId` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the `Agent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Export` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Metric` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PipelineVersion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RefreshToken` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Run` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RunTask` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `fk_dataset_id` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `input_json` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `item_key` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."Project_fk_user_id_idx";

-- AlterTable
ALTER TABLE "Document" DROP CONSTRAINT "Document_pkey",
DROP COLUMN "content",
DROP COLUMN "createdAt",
DROP COLUMN "datasetId",
DROP COLUMN "deletedAt",
DROP COLUMN "embedding",
DROP COLUMN "id",
DROP COLUMN "metadata",
DROP COLUMN "projectId",
DROP COLUMN "updatedAt",
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "document_id" SERIAL NOT NULL,
ADD COLUMN     "fk_dataset_id" INTEGER NOT NULL,
ADD COLUMN     "input_json" JSONB NOT NULL,
ADD COLUMN     "item_key" CHAR(128) NOT NULL,
ADD COLUMN     "metadata_json" JSONB,
ADD CONSTRAINT "Document_pkey" PRIMARY KEY ("document_id");

-- DropTable
DROP TABLE "public"."Agent";

-- DropTable
DROP TABLE "public"."Export";

-- DropTable
DROP TABLE "public"."Metric";

-- DropTable
DROP TABLE "public"."PipelineVersion";

-- DropTable
DROP TABLE "public"."RefreshToken";

-- DropTable
DROP TABLE "public"."Run";

-- DropTable
DROP TABLE "public"."RunTask";

-- CreateTable
CREATE TABLE "GoldAnnotation" (
    "gold_annotation_id" SERIAL NOT NULL,
    "fk_document_id" INTEGER NOT NULL,
    "annotation_type" CHAR(32) NOT NULL,
    "payload_json" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "current" BOOLEAN NOT NULL DEFAULT true,
    "fk_author_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "GoldAnnotation_pkey" PRIMARY KEY ("gold_annotation_id")
);

-- CreateTable
CREATE TABLE "JudgeAssessment" (
    "assessment_id" SERIAL NOT NULL,
    "fk_pipeline_id" INTEGER NOT NULL,
    "fk_dataset_id" INTEGER NOT NULL,
    "fk_weight_profile_id" INTEGER NOT NULL,
    "fk_normalization_profile_id" INTEGER NOT NULL,
    "fk_initiator_user_id" INTEGER NOT NULL,
    "status" CHAR(16) NOT NULL,
    "verdict" CHAR(16),
    "final_score" DECIMAL(4,3),
    "alpha_thresholds_json" JSONB NOT NULL,
    "hard_gate_status" CHAR(16),
    "preflight_warnings_json" JSONB,
    "preset" CHAR(16) NOT NULL,
    "request_json" JSONB NOT NULL,
    "summary_json" JSONB,
    "error_json" JSONB,
    "idempotency_key" CHAR(128),
    "total_items" INTEGER NOT NULL,
    "completed_items" INTEGER NOT NULL DEFAULT 0,
    "skipped_items" INTEGER NOT NULL DEFAULT 0,
    "failed_items" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "JudgeAssessment_pkey" PRIMARY KEY ("assessment_id")
);

-- CreateTable
CREATE TABLE "JudgeAssessmentItem" (
    "item_id" SERIAL NOT NULL,
    "fk_assessment_id" INTEGER NOT NULL,
    "fk_document_id" INTEGER NOT NULL,
    "item_index" INTEGER NOT NULL,
    "status" CHAR(16) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "agent_run_id" INTEGER,
    "agent_output_json" JSONB,
    "tool_call_trace_json" JSONB,
    "failure_class" CHAR(32),
    "failure_detail_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JudgeAssessmentItem_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "JudgeAssessmentInflight" (
    "inflight_id" SERIAL NOT NULL,
    "fk_pipeline_id" INTEGER NOT NULL,
    "fk_dataset_id" INTEGER NOT NULL,
    "fk_assessment_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeAssessmentInflight_pkey" PRIMARY KEY ("inflight_id")
);

-- CreateTable
CREATE TABLE "MetricDefinition" (
    "metric_id" SERIAL NOT NULL,
    "code" CHAR(32) NOT NULL,
    "axis" CHAR(2) NOT NULL,
    "title" CHAR(128) NOT NULL,
    "requires_reference" BOOLEAN NOT NULL,
    "executor" CHAR(16) NOT NULL,
    "description" CHAR(512),
    "source" CHAR(32),

    CONSTRAINT "MetricDefinition_pkey" PRIMARY KEY ("metric_id")
);

-- CreateTable
CREATE TABLE "MetricScore" (
    "score_id" SERIAL NOT NULL,
    "fk_assessment_id" INTEGER NOT NULL,
    "fk_metric_id" INTEGER NOT NULL,
    "fk_node_id" INTEGER NOT NULL,
    "value" DECIMAL(5,4) NOT NULL,
    "sample_size" INTEGER NOT NULL,
    "contributing_axis" CHAR(2) NOT NULL,
    "origin_reason" CHAR(256) NOT NULL,
    "executor_used" CHAR(16) NOT NULL,
    "aggregation_method" CHAR(32),
    "normalization_applied_json" JSONB,
    "details_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricScore_pkey" PRIMARY KEY ("score_id")
);

-- CreateTable
CREATE TABLE "WeightProfile" (
    "weight_profile_id" SERIAL NOT NULL,
    "code" CHAR(32) NOT NULL,
    "architectural_class" CHAR(16) NOT NULL,
    "method" CHAR(16) NOT NULL,
    "lambda" DECIMAL(3,2),
    "consistency_ratio" DECIMAL(4,3),
    "weights_json" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightProfile_pkey" PRIMARY KEY ("weight_profile_id")
);

-- CreateTable
CREATE TABLE "NormalizationProfile" (
    "normalization_profile_id" SERIAL NOT NULL,
    "code" CHAR(32) NOT NULL,
    "version" INTEGER NOT NULL,
    "params_json" JSONB NOT NULL,
    "calibrated_on_json" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizationProfile_pkey" PRIMARY KEY ("normalization_profile_id")
);

-- CreateTable
CREATE TABLE "AxisCoverage" (
    "coverage_id" SERIAL NOT NULL,
    "fk_assessment_id" INTEGER NOT NULL,
    "axis" CHAR(2) NOT NULL,
    "mandatory" BOOLEAN NOT NULL,
    "covered" BOOLEAN NOT NULL,
    "metric_count" INTEGER NOT NULL,

    CONSTRAINT "AxisCoverage_pkey" PRIMARY KEY ("coverage_id")
);

-- CreateTable
CREATE TABLE "OperationalMetrics" (
    "ops_id" SERIAL NOT NULL,
    "fk_assessment_id" INTEGER NOT NULL,
    "p95_latency_ms" INTEGER,
    "total_cost_usd" DECIMAL(10,6),
    "total_tokens_in" INTEGER,
    "total_tokens_out" INTEGER,
    "fail_rate" DECIMAL(5,4),
    "failure_taxonomy_json" JSONB,
    "hard_gate_status" CHAR(16),

    CONSTRAINT "OperationalMetrics_pkey" PRIMARY KEY ("ops_id")
);

-- CreateTable
CREATE TABLE "JudgeAssessmentFrozenGold" (
    "frozen_id" SERIAL NOT NULL,
    "fk_assessment_id" INTEGER NOT NULL,
    "fk_gold_annotation_id" INTEGER NOT NULL,
    "fk_document_id" INTEGER NOT NULL,
    "annotation_type" CHAR(32) NOT NULL,

    CONSTRAINT "JudgeAssessmentFrozenGold_pkey" PRIMARY KEY ("frozen_id")
);

-- CreateTable
CREATE TABLE "JudgeConversation" (
    "conversation_id" SERIAL NOT NULL,
    "fk_user_id" INTEGER NOT NULL,
    "fk_project_id" INTEGER NOT NULL,
    "fk_assessment_id" INTEGER,
    "title" CHAR(256),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JudgeConversation_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "JudgeMessage" (
    "message_id" SERIAL NOT NULL,
    "fk_conversation_id" INTEGER NOT NULL,
    "role" CHAR(16) NOT NULL,
    "content" TEXT NOT NULL,
    "tool_name" CHAR(64),
    "tool_call_id" CHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JudgeMessage_pkey" PRIMARY KEY ("message_id")
);

-- CreateIndex
CREATE INDEX "GoldAnnotation_fk_document_id_annotation_type_current_idx" ON "GoldAnnotation"("fk_document_id", "annotation_type", "current");

-- CreateIndex
CREATE UNIQUE INDEX "GoldAnnotation_fk_document_id_annotation_type_version_key" ON "GoldAnnotation"("fk_document_id", "annotation_type", "version");

-- CreateIndex
CREATE INDEX "JudgeAssessment_fk_pipeline_id_fk_dataset_id_idx" ON "JudgeAssessment"("fk_pipeline_id", "fk_dataset_id");

-- CreateIndex
CREATE INDEX "JudgeAssessment_status_idx" ON "JudgeAssessment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeAssessment_fk_pipeline_id_fk_dataset_id_idempotency_ke_key" ON "JudgeAssessment"("fk_pipeline_id", "fk_dataset_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "JudgeAssessmentItem_fk_assessment_id_status_idx" ON "JudgeAssessmentItem"("fk_assessment_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeAssessmentItem_fk_assessment_id_item_index_key" ON "JudgeAssessmentItem"("fk_assessment_id", "item_index");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeAssessmentInflight_fk_pipeline_id_fk_dataset_id_key" ON "JudgeAssessmentInflight"("fk_pipeline_id", "fk_dataset_id");

-- CreateIndex
CREATE UNIQUE INDEX "MetricDefinition_code_key" ON "MetricDefinition"("code");

-- CreateIndex
CREATE INDEX "MetricScore_fk_assessment_id_idx" ON "MetricScore"("fk_assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "MetricScore_fk_assessment_id_fk_metric_id_fk_node_id_key" ON "MetricScore"("fk_assessment_id", "fk_metric_id", "fk_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "WeightProfile_code_key" ON "WeightProfile"("code");

-- CreateIndex
CREATE UNIQUE INDEX "NormalizationProfile_code_version_key" ON "NormalizationProfile"("code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AxisCoverage_fk_assessment_id_axis_key" ON "AxisCoverage"("fk_assessment_id", "axis");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalMetrics_fk_assessment_id_key" ON "OperationalMetrics"("fk_assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "JudgeAssessmentFrozenGold_fk_assessment_id_fk_document_id_a_key" ON "JudgeAssessmentFrozenGold"("fk_assessment_id", "fk_document_id", "annotation_type");

-- CreateIndex
CREATE INDEX "JudgeConversation_fk_user_id_fk_project_id_idx" ON "JudgeConversation"("fk_user_id", "fk_project_id");

-- CreateIndex
CREATE INDEX "JudgeMessage_fk_conversation_id_created_at_idx" ON "JudgeMessage"("fk_conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "Document_fk_dataset_id_item_key_idx" ON "Document"("fk_dataset_id", "item_key");

-- CreateIndex
CREATE INDEX "Edge_fk_from_node_idx" ON "Edge"("fk_from_node");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_fk_dataset_id_fkey" FOREIGN KEY ("fk_dataset_id") REFERENCES "Dataset"("dataset_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldAnnotation" ADD CONSTRAINT "GoldAnnotation_fk_document_id_fkey" FOREIGN KEY ("fk_document_id") REFERENCES "Document"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldAnnotation" ADD CONSTRAINT "GoldAnnotation_fk_author_user_id_fkey" FOREIGN KEY ("fk_author_user_id") REFERENCES "User"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessment" ADD CONSTRAINT "JudgeAssessment_fk_pipeline_id_fkey" FOREIGN KEY ("fk_pipeline_id") REFERENCES "Pipeline"("pipeline_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessment" ADD CONSTRAINT "JudgeAssessment_fk_dataset_id_fkey" FOREIGN KEY ("fk_dataset_id") REFERENCES "Dataset"("dataset_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessment" ADD CONSTRAINT "JudgeAssessment_fk_weight_profile_id_fkey" FOREIGN KEY ("fk_weight_profile_id") REFERENCES "WeightProfile"("weight_profile_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessment" ADD CONSTRAINT "JudgeAssessment_fk_normalization_profile_id_fkey" FOREIGN KEY ("fk_normalization_profile_id") REFERENCES "NormalizationProfile"("normalization_profile_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessment" ADD CONSTRAINT "JudgeAssessment_fk_initiator_user_id_fkey" FOREIGN KEY ("fk_initiator_user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessmentItem" ADD CONSTRAINT "JudgeAssessmentItem_fk_assessment_id_fkey" FOREIGN KEY ("fk_assessment_id") REFERENCES "JudgeAssessment"("assessment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessmentItem" ADD CONSTRAINT "JudgeAssessmentItem_fk_document_id_fkey" FOREIGN KEY ("fk_document_id") REFERENCES "Document"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessmentInflight" ADD CONSTRAINT "JudgeAssessmentInflight_fk_pipeline_id_fkey" FOREIGN KEY ("fk_pipeline_id") REFERENCES "Pipeline"("pipeline_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessmentInflight" ADD CONSTRAINT "JudgeAssessmentInflight_fk_dataset_id_fkey" FOREIGN KEY ("fk_dataset_id") REFERENCES "Dataset"("dataset_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricScore" ADD CONSTRAINT "MetricScore_fk_assessment_id_fkey" FOREIGN KEY ("fk_assessment_id") REFERENCES "JudgeAssessment"("assessment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricScore" ADD CONSTRAINT "MetricScore_fk_metric_id_fkey" FOREIGN KEY ("fk_metric_id") REFERENCES "MetricDefinition"("metric_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricScore" ADD CONSTRAINT "MetricScore_fk_node_id_fkey" FOREIGN KEY ("fk_node_id") REFERENCES "Node"("node_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AxisCoverage" ADD CONSTRAINT "AxisCoverage_fk_assessment_id_fkey" FOREIGN KEY ("fk_assessment_id") REFERENCES "JudgeAssessment"("assessment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalMetrics" ADD CONSTRAINT "OperationalMetrics_fk_assessment_id_fkey" FOREIGN KEY ("fk_assessment_id") REFERENCES "JudgeAssessment"("assessment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessmentFrozenGold" ADD CONSTRAINT "JudgeAssessmentFrozenGold_fk_assessment_id_fkey" FOREIGN KEY ("fk_assessment_id") REFERENCES "JudgeAssessment"("assessment_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessmentFrozenGold" ADD CONSTRAINT "JudgeAssessmentFrozenGold_fk_gold_annotation_id_fkey" FOREIGN KEY ("fk_gold_annotation_id") REFERENCES "GoldAnnotation"("gold_annotation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeAssessmentFrozenGold" ADD CONSTRAINT "JudgeAssessmentFrozenGold_fk_document_id_fkey" FOREIGN KEY ("fk_document_id") REFERENCES "Document"("document_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeConversation" ADD CONSTRAINT "JudgeConversation_fk_user_id_fkey" FOREIGN KEY ("fk_user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeConversation" ADD CONSTRAINT "JudgeConversation_fk_project_id_fkey" FOREIGN KEY ("fk_project_id") REFERENCES "Project"("project_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeConversation" ADD CONSTRAINT "JudgeConversation_fk_assessment_id_fkey" FOREIGN KEY ("fk_assessment_id") REFERENCES "JudgeAssessment"("assessment_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JudgeMessage" ADD CONSTRAINT "JudgeMessage_fk_conversation_id_fkey" FOREIGN KEY ("fk_conversation_id") REFERENCES "JudgeConversation"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;
