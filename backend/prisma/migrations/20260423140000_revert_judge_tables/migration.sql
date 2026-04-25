-- DropForeignKey
ALTER TABLE "public"."AxisCoverage" DROP CONSTRAINT "AxisCoverage_fk_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."Document" DROP CONSTRAINT "Document_fk_dataset_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."GoldAnnotation" DROP CONSTRAINT "GoldAnnotation_fk_author_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."GoldAnnotation" DROP CONSTRAINT "GoldAnnotation_fk_document_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessment" DROP CONSTRAINT "JudgeAssessment_fk_dataset_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessment" DROP CONSTRAINT "JudgeAssessment_fk_initiator_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessment" DROP CONSTRAINT "JudgeAssessment_fk_normalization_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessment" DROP CONSTRAINT "JudgeAssessment_fk_pipeline_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessment" DROP CONSTRAINT "JudgeAssessment_fk_weight_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessmentFrozenGold" DROP CONSTRAINT "JudgeAssessmentFrozenGold_fk_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessmentFrozenGold" DROP CONSTRAINT "JudgeAssessmentFrozenGold_fk_document_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessmentFrozenGold" DROP CONSTRAINT "JudgeAssessmentFrozenGold_fk_gold_annotation_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessmentInflight" DROP CONSTRAINT "JudgeAssessmentInflight_fk_dataset_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessmentInflight" DROP CONSTRAINT "JudgeAssessmentInflight_fk_pipeline_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessmentItem" DROP CONSTRAINT "JudgeAssessmentItem_fk_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeAssessmentItem" DROP CONSTRAINT "JudgeAssessmentItem_fk_document_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeConversation" DROP CONSTRAINT "JudgeConversation_fk_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeConversation" DROP CONSTRAINT "JudgeConversation_fk_project_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeConversation" DROP CONSTRAINT "JudgeConversation_fk_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."JudgeMessage" DROP CONSTRAINT "JudgeMessage_fk_conversation_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."MetricScore" DROP CONSTRAINT "MetricScore_fk_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."MetricScore" DROP CONSTRAINT "MetricScore_fk_metric_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."MetricScore" DROP CONSTRAINT "MetricScore_fk_node_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."OperationalMetrics" DROP CONSTRAINT "OperationalMetrics_fk_assessment_id_fkey";

-- DropTable
DROP TABLE "public"."AxisCoverage";

-- DropTable
DROP TABLE "public"."Document";

-- DropTable
DROP TABLE "public"."GoldAnnotation";

-- DropTable
DROP TABLE "public"."JudgeAssessment";

-- DropTable
DROP TABLE "public"."JudgeAssessmentFrozenGold";

-- DropTable
DROP TABLE "public"."JudgeAssessmentInflight";

-- DropTable
DROP TABLE "public"."JudgeAssessmentItem";

-- DropTable
DROP TABLE "public"."JudgeConversation";

-- DropTable
DROP TABLE "public"."JudgeMessage";

-- DropTable
DROP TABLE "public"."MetricDefinition";

-- DropTable
DROP TABLE "public"."MetricScore";

-- DropTable
DROP TABLE "public"."NormalizationProfile";

-- DropTable
DROP TABLE "public"."OperationalMetrics";

-- DropTable
DROP TABLE "public"."WeightProfile";

