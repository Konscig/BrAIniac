package graph

import (
	"fmt"

	api "brainiac/gen"
)

var defaultMockNodes = []*api.PipelineNode{
	{
		Id:         "mock-node-llm-core",
		Key:        "llm-core",
		Label:      "LLM Core",
		Category:   "LLM",
		Status:     "running",
		Type:       "llm",
		PositionX:  120,
		PositionY:  80,
		ConfigJson: `{"model":"vk-labs-gpt","temperature":0.2}`,
	},
	{
		Id:         "mock-node-knowledge-base",
		Key:        "knowledge-base",
		Label:      "Knowledge Base",
		Category:   "Data",
		Status:     "idle",
		Type:       "data-retrieval",
		PositionX:  420,
		PositionY:  140,
		ConfigJson: `{"backend":"qdrant","namespace":"brainiac"}`,
	},
	{
		Id:         "mock-node-evaluator",
		Key:        "evaluator",
		Label:      "Evaluator",
		Category:   "Services",
		Status:     "idle",
		Type:       "judge",
		PositionX:  720,
		PositionY:  180,
		ConfigJson: `{"metric":"quality","threshold":0.8}`,
	},
	{
		Id:         "mock-node-monitoring",
		Key:        "monitoring",
		Label:      "Monitoring",
		Category:   "Utility",
		Status:     "idle",
		Type:       "monitor",
		PositionX:  960,
		PositionY:  220,
		ConfigJson: `{"sink":"vk-analytics"}`,
	},
}

var defaultMockEdges = []*api.PipelineEdge{
	{
		Id:     "mock-edge-llm-to-kb",
		Source: "mock-node-llm-core",
		Target: "mock-node-knowledge-base",
		Label:  "context",
	},
	{
		Id:     "mock-edge-kb-to-evaluator",
		Source: "mock-node-knowledge-base",
		Target: "mock-node-evaluator",
		Label:  "responses",
	},
	{
		Id:     "mock-edge-evaluator-to-monitor",
		Source: "mock-node-evaluator",
		Target: "mock-node-monitoring",
		Label:  "insights",
	},
}

func mockGraph(projectID, pipelineID string) graphPayload {
	suffix := pipelineID
	if suffix == "" {
		suffix = "default"
	}

	nodes := make([]*api.PipelineNode, 0, len(defaultMockNodes))
	for _, template := range defaultMockNodes {
		copy := *template
		copy.Id = fmt.Sprintf("%s::%s", template.Id, suffix)
		nodes = append(nodes, &copy)
	}

	edges := make([]*api.PipelineEdge, 0, len(defaultMockEdges))
	for _, template := range defaultMockEdges {
		copy := *template
		copy.Id = fmt.Sprintf("%s::%s", template.Id, suffix)
		copy.Source = fmt.Sprintf("%s::%s", template.Source, suffix)
		copy.Target = fmt.Sprintf("%s::%s", template.Target, suffix)
		edges = append(edges, &copy)
	}

	return graphPayload{nodes: nodes, edges: edges}
}
