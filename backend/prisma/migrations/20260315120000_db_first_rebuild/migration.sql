-- DB-first rebuild migration aligned with the provided physical model.

CREATE EXTENSION IF NOT EXISTS citext;

DROP TABLE IF EXISTS "Edge" CASCADE;
DROP TABLE IF EXISTS "Node" CASCADE;
DROP TABLE IF EXISTS "NodeType" CASCADE;
DROP TABLE IF EXISTS "Tool" CASCADE;
DROP TABLE IF EXISTS "Dataset" CASCADE;
DROP TABLE IF EXISTS "Pipeline" CASCADE;
DROP TABLE IF EXISTS "Project" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

CREATE TABLE "User" (
    "user_id" SERIAL NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" CHAR(256) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "Project" (
    "project_id" SERIAL NOT NULL,
    "fk_user_id" INTEGER NOT NULL,
    "name" CHAR(256) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("project_id")
);

CREATE TABLE "Pipeline" (
    "pipeline_id" SERIAL NOT NULL,
    "fk_project_id" INTEGER NOT NULL,
    "name" CHAR(256) NOT NULL,
    "max_time" INTEGER NOT NULL,
    "max_cost" INTEGER NOT NULL,
    "max_reject" NUMERIC(5,2) NOT NULL,
    "score" NUMERIC(3,2),
    "report_json" JSONB,
    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("pipeline_id")
);

CREATE TABLE "Dataset" (
    "dataset_id" SERIAL NOT NULL,
    "fk_pipeline_id" INTEGER NOT NULL,
    "desc" CHAR(512),
    "uri" TEXT NOT NULL,
    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("dataset_id")
);

CREATE TABLE "Tool" (
    "tool_id" SERIAL NOT NULL,
    "name" CHAR(64) NOT NULL,
    "config_json" JSONB NOT NULL,
    CONSTRAINT "Tool_pkey" PRIMARY KEY ("tool_id")
);

CREATE TABLE "NodeType" (
    "type_id" SERIAL NOT NULL,
    "fk_tool_id" INTEGER NOT NULL,
    "name" CHAR(64) NOT NULL,
    "desc" CHAR(512) NOT NULL,
    CONSTRAINT "NodeType_pkey" PRIMARY KEY ("type_id")
);

CREATE TABLE "Node" (
    "node_id" SERIAL NOT NULL,
    "fk_pipeline_id" INTEGER NOT NULL,
    "fk_type_id" INTEGER NOT NULL,
    "fk_sub_pipeline" INTEGER,
    "top_k" INTEGER NOT NULL,
    "output_json" JSONB,
    "ui_json" JSONB NOT NULL,
    CONSTRAINT "Node_pkey" PRIMARY KEY ("node_id")
);

CREATE TABLE "Edge" (
    "edge_id" SERIAL NOT NULL,
    "fk_from_node" INTEGER NOT NULL,
    "fk_to_node" INTEGER NOT NULL,
    CONSTRAINT "Edge_pkey" PRIMARY KEY ("edge_id"),
    CONSTRAINT "Edge_not_self_loop" CHECK ("fk_from_node" <> "fk_to_node")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_password_hash_key" ON "User"("password_hash");
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");
CREATE UNIQUE INDEX "Dataset_uri_key" ON "Dataset"("uri");
CREATE UNIQUE INDEX "Tool_name_key" ON "Tool"("name");
CREATE UNIQUE INDEX "Edge_fk_from_node_fk_to_node_key" ON "Edge"("fk_from_node", "fk_to_node");
CREATE UNIQUE INDEX "Dataset_fk_pipeline_id_key" ON "Dataset"("fk_pipeline_id");

CREATE INDEX "Project_fk_user_id_idx" ON "Project"("fk_user_id");
CREATE INDEX "Pipeline_fk_project_id_idx" ON "Pipeline"("fk_project_id");
CREATE INDEX "NodeType_fk_tool_id_idx" ON "NodeType"("fk_tool_id");
CREATE INDEX "Node_fk_pipeline_id_idx" ON "Node"("fk_pipeline_id");
CREATE INDEX "Node_fk_type_id_idx" ON "Node"("fk_type_id");
CREATE INDEX "Node_fk_sub_pipeline_idx" ON "Node"("fk_sub_pipeline");
CREATE INDEX "Edge_fk_to_node_idx" ON "Edge"("fk_to_node");

ALTER TABLE "Project"
    ADD CONSTRAINT "Project_fk_user_id_fkey"
    FOREIGN KEY ("fk_user_id") REFERENCES "User"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Pipeline"
    ADD CONSTRAINT "Pipeline_fk_project_id_fkey"
    FOREIGN KEY ("fk_project_id") REFERENCES "Project"("project_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Dataset"
    ADD CONSTRAINT "Dataset_fk_pipeline_id_fkey"
    FOREIGN KEY ("fk_pipeline_id") REFERENCES "Pipeline"("pipeline_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NodeType"
    ADD CONSTRAINT "NodeType_fk_tool_id_fkey"
    FOREIGN KEY ("fk_tool_id") REFERENCES "Tool"("tool_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Node"
    ADD CONSTRAINT "Node_fk_pipeline_id_fkey"
    FOREIGN KEY ("fk_pipeline_id") REFERENCES "Pipeline"("pipeline_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Node"
    ADD CONSTRAINT "Node_fk_type_id_fkey"
    FOREIGN KEY ("fk_type_id") REFERENCES "NodeType"("type_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Node"
    ADD CONSTRAINT "Node_fk_sub_pipeline_fkey"
    FOREIGN KEY ("fk_sub_pipeline") REFERENCES "Pipeline"("pipeline_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Edge"
    ADD CONSTRAINT "Edge_fk_from_node_fkey"
    FOREIGN KEY ("fk_from_node") REFERENCES "Node"("node_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Edge"
    ADD CONSTRAINT "Edge_fk_to_node_fkey"
    FOREIGN KEY ("fk_to_node") REFERENCES "Node"("node_id") ON DELETE CASCADE ON UPDATE CASCADE;
