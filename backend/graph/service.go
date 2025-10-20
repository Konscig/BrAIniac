package graph

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	api "brainiac/gen"
	"brainiac/models/graphmodels"

	"github.com/gofrs/uuid/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	emptypb "google.golang.org/protobuf/types/known/emptypb"
	"gorm.io/gorm"
)

const (
	defaultNodeStatus = "idle"
	draftVersionState = "draft"
	publishedState    = "published"
)

// Service implements the AgentGraphService RPC surface and CRUD orchestration.
type Service struct {
	api.UnimplementedAgentGraphServiceServer
	db         *gorm.DB
	mistralKey string
}

// NewService wires the graph service with a database handle.
func NewService(db *gorm.DB, mistralKey string) *Service {
	return &Service{
		db:         db,
		mistralKey: mistralKey,
	}
}

type graphPayload struct {
	nodes []*api.PipelineNode
	edges []*api.PipelineEdge
}

// GetPipelineGraph returns pipeline graph data based on the requested environment mode.
func (s *Service) GetPipelineGraph(ctx context.Context, req *api.GetPipelineGraphRequest) (*api.GetPipelineGraphResponse, error) {
	if req.GetPipelineId() == "" {
		return nil, status.Error(codes.InvalidArgument, "pipeline_id is required")
	}

	mode := req.GetMode()
	if mode == api.EnvironmentMode_ENVIRONMENT_MODE_UNSPECIFIED {
		mode = api.EnvironmentMode_ENVIRONMENT_MODE_TEST
	}

	pipeline, err := s.loadPipeline(ctx, req.GetProjectId(), req.GetPipelineId())
	if err != nil {
		return nil, err
	}

	payload, err := s.graphForMode(ctx, pipeline, mode)
	if err != nil {
		return nil, err
	}

	if len(payload.nodes) == 0 && (mode == api.EnvironmentMode_ENVIRONMENT_MODE_TEST || mode == api.EnvironmentMode_ENVIRONMENT_MODE_HYBRID) {
		payload = mergeGraph(payload, mockGraph(req.GetProjectId(), req.GetPipelineId()))
	}

	resp := &api.GetPipelineGraphResponse{
		Nodes: payload.nodes,
		Edges: payload.edges,
	}

	sort.Slice(resp.Nodes, func(i, j int) bool {
		if resp.Nodes[i].Label == resp.Nodes[j].Label {
			return resp.Nodes[i].Id < resp.Nodes[j].Id
		}
		return resp.Nodes[i].Label < resp.Nodes[j].Label
	})
	sort.Slice(resp.Edges, func(i, j int) bool {
		left := resp.Edges[i].Source + resp.Edges[i].Target + resp.Edges[i].Label
		right := resp.Edges[j].Source + resp.Edges[j].Target + resp.Edges[j].Label
		if left == right {
			return resp.Edges[i].Id < resp.Edges[j].Id
		}
		return left < right
	})

	return resp, nil
}

// CreatePipelineNode adds a node to the editable draft version of the pipeline graph.
func (s *Service) CreatePipelineNode(ctx context.Context, req *api.CreatePipelineNodeRequest) (*api.PipelineNode, error) {
	_, draft, err := s.ensureDraftContext(ctx, req.GetProjectId(), req.GetPipelineId())
	if err != nil {
		return nil, err
	}

	label := strings.TrimSpace(req.GetLabel())
	if label == "" {
		label = strings.TrimSpace(req.GetType())
	}
	if label == "" {
		return nil, status.Error(codes.InvalidArgument, "label or type must be provided")
	}

	category := strings.TrimSpace(req.GetCategory())
	if category == "" {
		category = "Utility"
	}

	typeName := strings.TrimSpace(req.GetType())
	if typeName == "" {
		typeName = strings.ToLower(category)
	}

	key, err := s.generateUniqueNodeKey(ctx, draft.ID, label)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to generate node key: %v", err)
	}

	configJSON, err := sanitizeJSON(req.GetConfigJson())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "config_json: %v", err)
	}

	node := graphmodels.Node{
		VersionID:  draft.ID,
		Key:        key,
		Label:      label,
		Category:   category,
		Type:       typeName,
		Status:     normalizeStatus(req.GetStatus()),
		PositionX:  req.GetPositionX(),
		PositionY:  req.GetPositionY(),
		ConfigJSON: configJSON,
	}

	if err := node.Save(ctx, s.db); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to persist node: %v", err)
	}

	return mapNodeModel(&node), nil
}

// UpdatePipelineNode mutates a node within the draft version.
func (s *Service) UpdatePipelineNode(ctx context.Context, req *api.UpdatePipelineNodeRequest) (*api.PipelineNode, error) {
	if req.GetNodeId() == "" {
		return nil, status.Error(codes.InvalidArgument, "node_id is required")
	}

	_, draft, err := s.ensureDraftContext(ctx, req.GetProjectId(), req.GetPipelineId())
	if err != nil {
		return nil, err
	}

	nodeID, err := parseUUID(req.GetNodeId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid node_id: %v", err)
	}

	var node graphmodels.Node
	if err := s.db.WithContext(ctx).
		Where("version_id = ? AND id = ?", draft.ID, nodeID).
		First(&node).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, status.Errorf(codes.NotFound, "node %s not found", req.GetNodeId())
		}
		return nil, status.Errorf(codes.Internal, "failed to load node: %v", err)
	}

	label := strings.TrimSpace(req.GetLabel())
	if label == "" {
		label = node.Label
	}

	category := strings.TrimSpace(req.GetCategory())
	if category == "" {
		category = node.Category
	}

	typeName := strings.TrimSpace(req.GetType())
	if typeName == "" {
		typeName = node.Type
	}

	statusValue := normalizeStatus(req.GetStatus())
	if statusValue == "" {
		statusValue = node.Status
	}

	configValue := node.ConfigJSON
	if trimmed := strings.TrimSpace(req.GetConfigJson()); trimmed != "" {
		configValue, err = sanitizeJSON(trimmed)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "config_json: %v", err)
		}
	}

	updates := map[string]interface{}{
		"label":       label,
		"category":    category,
		"type":        typeName,
		"status":      statusValue,
		"position_x":  req.GetPositionX(),
		"position_y":  req.GetPositionY(),
		"config_json": configValue,
	}

	if label != node.Label {
		key, genErr := s.generateUniqueNodeKey(ctx, draft.ID, label)
		if genErr != nil {
			return nil, status.Errorf(codes.Internal, "failed to generate node key: %v", genErr)
		}
		updates["key"] = key
	}

	if err := s.db.WithContext(ctx).
		Model(&node).
		Where("version_id = ? AND id = ?", draft.ID, nodeID).
		Updates(updates).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update node: %v", err)
	}

	if err := s.db.WithContext(ctx).
		Where("version_id = ? AND id = ?", draft.ID, nodeID).
		First(&node).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to reload node: %v", err)
	}

	return mapNodeModel(&node), nil
}

// DeletePipelineNode removes a node and associated edges from the draft version.
func (s *Service) DeletePipelineNode(ctx context.Context, req *api.DeletePipelineNodeRequest) (*emptypb.Empty, error) {
	if req.GetNodeId() == "" {
		return nil, status.Error(codes.InvalidArgument, "node_id is required")
	}

	_, draft, err := s.ensureDraftContext(ctx, req.GetProjectId(), req.GetPipelineId())
	if err != nil {
		return nil, err
	}

	nodeID, err := parseUUID(req.GetNodeId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid node_id: %v", err)
	}

	txErr := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("version_id = ? AND (from_node = ? OR to_node = ?)", draft.ID, nodeID, nodeID).
			Delete(&graphmodels.Edge{}).Error; err != nil {
			return err
		}
		res := tx.Where("version_id = ? AND id = ?", draft.ID, nodeID)
		if err := res.Delete(&graphmodels.Node{}).Error; err != nil {
			return err
		}
		if res.RowsAffected == 0 {
			return status.Errorf(codes.NotFound, "node %s not found", req.GetNodeId())
		}
		return nil
	})
	if txErr != nil {
		if st, ok := status.FromError(txErr); ok {
			return nil, st.Err()
		}
		return nil, status.Errorf(codes.Internal, "failed to delete node: %v", txErr)
	}

	return &emptypb.Empty{}, nil
}

// CreatePipelineEdge wires two nodes in the draft version.
func (s *Service) CreatePipelineEdge(ctx context.Context, req *api.CreatePipelineEdgeRequest) (*api.PipelineEdge, error) {
	if req.GetSource() == "" || req.GetTarget() == "" {
		return nil, status.Error(codes.InvalidArgument, "source and target are required")
	}

	_, draft, err := s.ensureDraftContext(ctx, req.GetProjectId(), req.GetPipelineId())
	if err != nil {
		return nil, err
	}

	sourceID, err := parseUUID(req.GetSource())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid source id: %v", err)
	}
	targetID, err := parseUUID(req.GetTarget())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid target id: %v", err)
	}

	if sourceID == targetID {
		return nil, status.Error(codes.InvalidArgument, "self-referencing edges are not allowed")
	}

	if err := s.ensureNodesExist(ctx, draft.ID, []uuid.UUID{sourceID, targetID}); err != nil {
		return nil, err
	}

	edge := graphmodels.Edge{
		VersionID: draft.ID,
		FromNode:  sourceID,
		ToNode:    targetID,
		Label:     strings.TrimSpace(req.GetLabel()),
	}

	if err := edge.Save(ctx, s.db); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to persist edge: %v", err)
	}

	return mapEdgeModel(&edge), nil
}

// DeletePipelineEdge removes an edge from the draft version.
func (s *Service) DeletePipelineEdge(ctx context.Context, req *api.DeletePipelineEdgeRequest) (*emptypb.Empty, error) {
	if req.GetEdgeId() == "" {
		return nil, status.Error(codes.InvalidArgument, "edge_id is required")
	}

	_, draft, err := s.ensureDraftContext(ctx, req.GetProjectId(), req.GetPipelineId())
	if err != nil {
		return nil, err
	}

	edgeID, err := parseUUID(req.GetEdgeId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid edge_id: %v", err)
	}

	res := s.db.WithContext(ctx).
		Where("version_id = ? AND id = ?", draft.ID, edgeID).
		Delete(&graphmodels.Edge{})
	if res.Error != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete edge: %v", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, status.Errorf(codes.NotFound, "edge %s not found", req.GetEdgeId())
	}

	return &emptypb.Empty{}, nil
}

// ListProjects exposes a minimal project list for navigation.
func (s *Service) ListProjects(ctx context.Context, _ *emptypb.Empty) (*api.ListProjectsResponse, error) {
	var projects []graphmodels.Project
	if err := s.db.WithContext(ctx).
		Order("created_at DESC").
		Find(&projects).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list projects: %v", err)
	}

	resp := &api.ListProjectsResponse{
		Projects: make([]*api.ProjectSummary, 0, len(projects)),
	}

	for _, project := range projects {
		proj := project
		resp.Projects = append(resp.Projects, &api.ProjectSummary{
			Id:          proj.ID.String(),
			Name:        proj.Name,
			Description: proj.Description,
		})
	}

	return resp, nil
}

// CreateProject creates a new project
func (s *Service) CreateProject(ctx context.Context, req *api.CreateProjectRequest) (*api.ProjectSummary, error) {
	name := strings.TrimSpace(req.GetName())
	if name == "" {
		return nil, status.Error(codes.InvalidArgument, "project name is required")
	}

	project := graphmodels.Project{
		Name:        name,
		Description: strings.TrimSpace(req.GetDescription()),
	}

	if err := s.db.WithContext(ctx).Create(&project).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create project: %v", err)
	}

	return &api.ProjectSummary{
		Id:          project.ID.String(),
		Name:        project.Name,
		Description: project.Description,
	}, nil
}

// ListPipelines exposes pipelines for a given project.
func (s *Service) ListPipelines(ctx context.Context, req *api.ListPipelinesRequest) (*api.ListPipelinesResponse, error) {
	if req.GetProjectId() == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}

	projectID, err := parseUUID(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	var pipelines []graphmodels.Pipeline
	if err := s.db.WithContext(ctx).
		Where("project_id = ?", projectID).
		Order("created_at DESC").
		Find(&pipelines).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list pipelines: %v", err)
	}

	resp := &api.ListPipelinesResponse{Pipelines: make([]*api.PipelineSummary, 0, len(pipelines))}

	for _, pipeline := range pipelines {
		p := pipeline
		versionNumber, err := s.currentPublishedVersionNumber(ctx, p)
		if err != nil {
			return nil, err
		}

		resp.Pipelines = append(resp.Pipelines, &api.PipelineSummary{
			Id:          p.ID.String(),
			Name:        p.Name,
			Description: p.Description,
			Version:     int32(versionNumber),
		})
	}

	return resp, nil
}

// CreatePipeline creates a new pipeline for a project
func (s *Service) CreatePipeline(ctx context.Context, req *api.CreatePipelineRequest) (*api.PipelineSummary, error) {
	if req.GetProjectId() == "" {
		return nil, status.Error(codes.InvalidArgument, "project_id is required")
	}

	projectID, err := parseUUID(req.GetProjectId())
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
	}

	name := strings.TrimSpace(req.GetName())
	if name == "" {
		return nil, status.Error(codes.InvalidArgument, "pipeline name is required")
	}

	pipeline := graphmodels.Pipeline{
		ProjectID:   projectID,
		Name:        name,
		Description: strings.TrimSpace(req.GetDescription()),
	}

	if err := pipeline.Save(ctx, s.db); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create pipeline: %v", err)
	}

	if _, err := s.ensureDraftVersion(ctx, pipeline.ID); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to bootstrap pipeline draft: %v", err)
	}

	return &api.PipelineSummary{
		Id:          pipeline.ID.String(),
		Name:        pipeline.Name,
		Description: pipeline.Description,
		Version:     0,
	}, nil
}

// PublishPipelineVersion promotes the current draft to a published version and forks a fresh draft copy.
func (s *Service) PublishPipelineVersion(ctx context.Context, req *api.PublishPipelineVersionRequest) (*api.PublishPipelineVersionResponse, error) {
	pipeline, draft, err := s.ensureDraftContext(ctx, req.GetProjectId(), req.GetPipelineId())
	if err != nil {
		return nil, err
	}

	var nodeCount int64
	if err := s.db.WithContext(ctx).
		Model(&graphmodels.Node{}).
		Where("version_id = ?", draft.ID).
		Count(&nodeCount).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to inspect draft nodes: %v", err)
	}
	if nodeCount == 0 {
		return nil, status.Error(codes.FailedPrecondition, "draft pipeline has no nodes to publish")
	}

	var published graphmodels.PipelineVersion

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var maxVersion int64
		if err := tx.Model(&graphmodels.PipelineVersion{}).
			Where("pipeline_id = ? AND state = ?", pipeline.ID, publishedState).
			Select("COALESCE(MAX(number), 0)").
			Scan(&maxVersion).Error; err != nil {
			return err
		}

		nextNumber := int(maxVersion) + 1

		metadata := map[string]string{
			"notes":        strings.TrimSpace(req.GetNotes()),
			"published_at": time.Now().UTC().Format(time.RFC3339),
		}
		metadataJSON, err := json.Marshal(metadata)
		if err != nil {
			return err
		}

		if err := tx.Model(&graphmodels.PipelineVersion{}).
			Where("id = ?", draft.ID).
			Updates(map[string]interface{}{
				"state":         publishedState,
				"number":        nextNumber,
				"metadata_json": string(metadataJSON),
			}).Error; err != nil {
			return err
		}

		if err := tx.Model(&graphmodels.Pipeline{}).
			Where("id = ?", pipeline.ID).
			Update("last_published_version_id", draft.ID).Error; err != nil {
			return err
		}

		published = *draft
		published.Number = nextNumber
		published.State = publishedState
		published.MetadataJSON = string(metadataJSON)

		newDraft := graphmodels.PipelineVersion{
			PipelineID:   pipeline.ID,
			Number:       nextNumber + 1,
			State:        draftVersionState,
			MetadataJSON: "{}",
		}
		if err := tx.Create(&newDraft).Error; err != nil {
			return err
		}

		var draftNodes []graphmodels.Node
		if err := tx.Where("version_id = ?", draft.ID).Find(&draftNodes).Error; err != nil {
			return err
		}

		idMap := make(map[uuid.UUID]uuid.UUID, len(draftNodes))
		for _, node := range draftNodes {
			clone := graphmodels.Node{
				VersionID:  newDraft.ID,
				Key:        node.Key,
				Label:      node.Label,
				Category:   node.Category,
				Type:       node.Type,
				Status:     defaultNodeStatus,
				PositionX:  node.PositionX,
				PositionY:  node.PositionY,
				ConfigJSON: node.ConfigJSON,
			}
			if err := tx.Create(&clone).Error; err != nil {
				return err
			}
			idMap[node.ID] = clone.ID
		}

		var draftEdges []graphmodels.Edge
		if err := tx.Where("version_id = ?", draft.ID).Find(&draftEdges).Error; err != nil {
			return err
		}

		for _, edge := range draftEdges {
			fromID, okFrom := idMap[edge.FromNode]
			toID, okTo := idMap[edge.ToNode]
			if !okFrom || !okTo {
				continue
			}
			clone := graphmodels.Edge{
				VersionID: newDraft.ID,
				FromNode:  fromID,
				ToNode:    toID,
				Label:     edge.Label,
			}
			if err := tx.Create(&clone).Error; err != nil {
				return err
			}
		}

		// Switch authoring to the freshly cloned draft version.
		draft.ID = newDraft.ID
		draft.Number = newDraft.Number
		draft.State = newDraft.State

		return nil
	})
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to publish pipeline: %v", err)
	}

	return &api.PublishPipelineVersionResponse{
		VersionId:     published.ID.String(),
		VersionNumber: int32(published.Number),
	}, nil
}

// ExecutePipeline triggers pipeline execution with Mistral AI support
func (s *Service) ExecutePipeline(ctx context.Context, req *api.ExecutePipelineRequest) (*api.ExecutePipelineResponse, error) {
	if req.GetPipelineId() == "" {
		return nil, status.Error(codes.InvalidArgument, "pipeline_id is required")
	}

	mode := req.GetMode()
	if mode == api.EnvironmentMode_ENVIRONMENT_MODE_UNSPECIFIED {
		mode = api.EnvironmentMode_ENVIRONMENT_MODE_TEST
	}

	pipeline, err := s.loadPipeline(ctx, req.GetProjectId(), req.GetPipelineId())
	if err != nil {
		return nil, err
	}

	payload, err := s.graphForMode(ctx, pipeline, mode)
	if err != nil {
		return nil, err
	}

	if len(payload.nodes) == 0 {
		payload = mergeGraph(payload, mockGraph(req.GetProjectId(), req.GetPipelineId()))
	}

	order := topologicalOrder(payload)
	outputs := make(map[string]string, len(payload.nodes))
	results := make([]*api.NodeExecutionResult, 0, len(payload.nodes))
	inbound := buildInboundIndex(payload)
	lookup := make(map[string]*api.PipelineNode, len(payload.nodes))

	for _, node := range payload.nodes {
		lookup[node.Id] = node
	}

	// Find trigger input
	triggerInput := req.GetTriggerInput()
	if triggerInput == "" {
		triggerInput = "Default trigger input"
	}

	// Collect tools for LLM nodes
	tools := s.collectTools(payload)

	var finalOutput string

	for _, nodeID := range order {
		node := lookup[nodeID]
		if node == nil {
			continue
		}

		inputs := make([]string, 0, len(inbound[nodeID]))
		for _, parentID := range inbound[nodeID] {
			if out, ok := outputs[parentID]; ok {
				inputs = append(inputs, out)
			}
		}

		// Check if this is a trigger node
		nodeType := strings.ToLower(node.GetType())
		if nodeType == "trigger" || nodeType == "input-trigger" {
			outputs[node.Id] = triggerInput
			results = append(results, &api.NodeExecutionResult{
				NodeId: node.Id,
				Status: "completed",
				Output: triggerInput,
			})
			continue
		}

		// Execute node
		statusValue, output := s.executeNode(ctx, node, inputs, tools)
		outputs[node.Id] = output

		// Check if this is a response node
		if nodeType == "response" || nodeType == "output-response" {
			finalOutput = output
		}

		results = append(results, &api.NodeExecutionResult{
			NodeId: node.Id,
			Status: statusValue,
			Output: output,
		})
	}

	return &api.ExecutePipelineResponse{
		Results:     results,
		FinalOutput: finalOutput,
	}, nil
}

// mergeGraph overlays the primary graph on top of the fallback, preferring primary entries.
func mergeGraph(primary graphPayload, fallback graphPayload) graphPayload {
	nodeMap := make(map[string]*api.PipelineNode)
	for _, node := range fallback.nodes {
		nodeMap[nodeKey(node.Key, node.Id)] = node
	}
	for _, node := range primary.nodes {
		nodeMap[nodeKey(node.Key, node.Id)] = node
	}

	nodes := make([]*api.PipelineNode, 0, len(nodeMap))
	for _, node := range nodeMap {
		nodes = append(nodes, node)
	}

	edgeMap := make(map[string]*api.PipelineEdge)
	for _, edge := range fallback.edges {
		edgeMap[edgeKeyPtr(edge)] = edge
	}
	for _, edge := range primary.edges {
		edgeMap[edgeKeyPtr(edge)] = edge
	}

	edges := make([]*api.PipelineEdge, 0, len(edgeMap))
	for _, edge := range edgeMap {
		edges = append(edges, edge)
	}

	return graphPayload{nodes: nodes, edges: edges}
}

func (s *Service) graphForMode(ctx context.Context, pipeline *graphmodels.Pipeline, mode api.EnvironmentMode) (graphPayload, error) {
	draft, err := s.loadVersionByState(ctx, pipeline.ID, draftVersionState)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return graphPayload{}, err
	}

	published, err := s.loadVersionByState(ctx, pipeline.ID, publishedState)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return graphPayload{}, err
	}

	switch mode {
	case api.EnvironmentMode_ENVIRONMENT_MODE_REAL:
		if published != nil {
			return s.graphForVersion(ctx, published.ID)
		}
		if draft != nil {
			payload, err := s.graphForVersion(ctx, draft.ID)
			if err != nil {
				return graphPayload{}, err
			}
			return payload, nil
		}
		return graphPayload{}, status.Error(codes.NotFound, "pipeline has no graph versions")
	case api.EnvironmentMode_ENVIRONMENT_MODE_HYBRID:
		var base graphPayload
		if published != nil {
			base, err = s.graphForVersion(ctx, published.ID)
			if err != nil {
				return graphPayload{}, err
			}
		}
		if draft != nil {
			draftPayload, err := s.graphForVersion(ctx, draft.ID)
			if err != nil {
				return graphPayload{}, err
			}
			return mergeGraph(draftPayload, base), nil
		}
		return base, nil
	default:
		if draft != nil {
			return s.graphForVersion(ctx, draft.ID)
		}
		return graphPayload{}, nil
	}
}

func (s *Service) graphForVersion(ctx context.Context, versionID uuid.UUID) (graphPayload, error) {
	var nodes []graphmodels.Node
	if err := s.db.WithContext(ctx).
		Where("version_id = ?", versionID).
		Order("created_at ASC").
		Find(&nodes).Error; err != nil {
		return graphPayload{}, status.Errorf(codes.Internal, "failed to load nodes: %v", err)
	}

	var edges []graphmodels.Edge
	if err := s.db.WithContext(ctx).
		Where("version_id = ?", versionID).
		Order("created_at ASC").
		Find(&edges).Error; err != nil {
		return graphPayload{}, status.Errorf(codes.Internal, "failed to load edges: %v", err)
	}

	payload := graphPayload{
		nodes: make([]*api.PipelineNode, 0, len(nodes)),
		edges: make([]*api.PipelineEdge, 0, len(edges)),
	}

	for idx := range nodes {
		payload.nodes = append(payload.nodes, mapNodeModel(&nodes[idx]))
	}
	for idx := range edges {
		payload.edges = append(payload.edges, mapEdgeModel(&edges[idx]))
	}

	return payload, nil
}

func mapNodeModel(node *graphmodels.Node) *api.PipelineNode {
	return &api.PipelineNode{
		Id:         node.ID.String(),
		Key:        node.Key,
		Label:      node.Label,
		Category:   node.Category,
		Status:     node.Status,
		Type:       node.Type,
		PositionX:  node.PositionX,
		PositionY:  node.PositionY,
		ConfigJson: node.ConfigJSON,
	}
}

func mapEdgeModel(edge *graphmodels.Edge) *api.PipelineEdge {
	return &api.PipelineEdge{
		Id:     edge.ID.String(),
		Source: edge.FromNode.String(),
		Target: edge.ToNode.String(),
		Label:  edge.Label,
	}
}

func (s *Service) loadPipeline(ctx context.Context, projectID, pipelineID string) (*graphmodels.Pipeline, error) {
	pid, err := parseUUID(pipelineID)
	if err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid pipeline_id: %v", err)
	}

	query := s.db.WithContext(ctx).
		Where("id = ?", pid)

	if projectID != "" {
		projID, err := parseUUID(projectID)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "invalid project_id: %v", err)
		}
		query = query.Where("project_id = ?", projID)
	}

	var pipeline graphmodels.Pipeline
	if err := query.First(&pipeline).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, status.Error(codes.NotFound, "pipeline not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to load pipeline: %v", err)
	}

	return &pipeline, nil
}

func (s *Service) ensureDraftContext(ctx context.Context, projectID, pipelineID string) (*graphmodels.Pipeline, *graphmodels.PipelineVersion, error) {
	pipeline, err := s.loadPipeline(ctx, projectID, pipelineID)
	if err != nil {
		return nil, nil, err
	}

	draft, err := s.ensureDraftVersion(ctx, pipeline.ID)
	if err != nil {
		return nil, nil, err
	}

	return pipeline, draft, nil
}

func (s *Service) ensureDraftVersion(ctx context.Context, pipelineID uuid.UUID) (*graphmodels.PipelineVersion, error) {
	draft, err := s.loadVersionByState(ctx, pipelineID, draftVersionState)
	if err == nil && draft != nil {
		return draft, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	newDraft := graphmodels.PipelineVersion{
		PipelineID:   pipelineID,
		Number:       1,
		State:        draftVersionState,
		MetadataJSON: "{}",
	}

	if err := s.db.WithContext(ctx).Create(&newDraft).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create draft version: %v", err)
	}

	return &newDraft, nil
}

func (s *Service) loadVersionByState(ctx context.Context, pipelineID uuid.UUID, state string) (*graphmodels.PipelineVersion, error) {
	var version graphmodels.PipelineVersion
	err := s.db.WithContext(ctx).
		Where("pipeline_id = ? AND state = ?", pipelineID, state).
		Order("updated_at DESC").
		First(&version).Error
	if err != nil {
		return nil, err
	}
	return &version, nil
}

func (s *Service) generateUniqueNodeKey(ctx context.Context, versionID uuid.UUID, label string) (string, error) {
	base := slugify(label)
	if base == "" {
		base = "node"
	}

	candidate := base
	attempt := 1

	for {
		var count int64
		err := s.db.WithContext(ctx).
			Model(&graphmodels.Node{}).
			Where("version_id = ? AND key = ?", versionID, candidate).
			Count(&count).Error
		if err != nil {
			return "", err
		}
		if count == 0 {
			return candidate, nil
		}
		attempt++
		candidate = fmt.Sprintf("%s-%d", base, attempt)
	}
}

func slugify(input string) string {
	trimmed := strings.TrimSpace(strings.ToLower(input))
	if trimmed == "" {
		return ""
	}

	builder := strings.Builder{}
	builder.Grow(len(trimmed))
	for _, r := range trimmed {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
			continue
		}
		if r == ' ' || r == '_' || r == '-' {
			builder.WriteRune('-')
			continue
		}
	}

	slug := strings.Trim(builder.String(), "-")
	slug = strings.ReplaceAll(slug, "--", "-")
	return slug
}

func nodeKey(key, id string) string {
	if key != "" {
		return key
	}
	return id
}

func edgeKeyPtr(edge *api.PipelineEdge) string {
	return edge.Source + ":" + edge.Target + ":" + edge.Label
}

func parseUUID(value string) (uuid.UUID, error) {
	if value == "" {
		return uuid.Nil, errors.New("empty uuid")
	}
	return uuid.FromString(value)
}

func sanitizeJSON(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "{}", nil
	}
	var tmp interface{}
	if err := json.Unmarshal([]byte(trimmed), &tmp); err != nil {
		return "", err
	}
	cleaned, err := json.Marshal(tmp)
	if err != nil {
		return "", err
	}
	return string(cleaned), nil
}

func normalizeStatus(status string) string {
	value := strings.ToLower(strings.TrimSpace(status))
	switch value {
	case "running", "completed", "error", "idle":
		return value
	default:
		if value == "" {
			return defaultNodeStatus
		}
		return value
	}
}

func (s *Service) ensureNodesExist(ctx context.Context, versionID uuid.UUID, ids []uuid.UUID) error {
	var count int64
	if err := s.db.WithContext(ctx).
		Model(&graphmodels.Node{}).
		Where("version_id = ? AND id IN ?", versionID, ids).
		Count(&count).Error; err != nil {
		return status.Errorf(codes.Internal, "failed to verify nodes: %v", err)
	}
	if count != int64(len(ids)) {
		return status.Error(codes.NotFound, "one or more nodes are missing")
	}
	return nil
}

func (s *Service) currentPublishedVersionNumber(ctx context.Context, pipeline graphmodels.Pipeline) (int, error) {
	if pipeline.LastPublishedVersionID == uuid.Nil {
		return 0, nil
	}

	var version graphmodels.PipelineVersion
	if err := s.db.WithContext(ctx).
		Where("id = ?", pipeline.LastPublishedVersionID).
		First(&version).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, nil
		}
		return 0, status.Errorf(codes.Internal, "failed to load published version: %v", err)
	}

	return version.Number, nil
}

func topologicalOrder(payload graphPayload) []string {
	inDegree := make(map[string]int)
	next := make(map[string][]string)

	for _, node := range payload.nodes {
		inDegree[node.Id] = 0
	}

	for _, edge := range payload.edges {
		if _, ok := inDegree[edge.Target]; ok {
			inDegree[edge.Target]++
		}
		next[edge.Source] = append(next[edge.Source], edge.Target)
	}

	queue := make([]string, 0, len(inDegree))
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}
	sort.Strings(queue)

	order := make([]string, 0, len(inDegree))

	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		order = append(order, id)

		for _, child := range next[id] {
			if deg, ok := inDegree[child]; ok {
				inDegree[child] = deg - 1
				if inDegree[child] == 0 {
					queue = append(queue, child)
					sort.Strings(queue)
				}
			}
		}
	}

	if len(order) != len(inDegree) {
		remaining := make([]string, 0, len(inDegree)-len(order))
		seen := make(map[string]struct{}, len(order))
		for _, id := range order {
			seen[id] = struct{}{}
		}
		for id := range inDegree {
			if _, ok := seen[id]; !ok {
				remaining = append(remaining, id)
			}
		}
		sort.Strings(remaining)
		order = append(order, remaining...)
	}

	return order
}

func buildInboundIndex(payload graphPayload) map[string][]string {
	inbound := make(map[string][]string)
	for _, edge := range payload.edges {
		inbound[edge.Target] = append(inbound[edge.Target], edge.Source)
	}
	return inbound
}

// simulateNode removed — logic embedded in executeNode and simulate paths above.

func decodeConfig(raw string) map[string]interface{} {
	result := make(map[string]interface{})
	if raw == "" {
		return result
	}
	_ = json.Unmarshal([]byte(raw), &result)
	return result
}

func configValue(config map[string]interface{}, key, fallback string) string {
	keyLower := strings.ToLower(key)
	for k, v := range config {
		if strings.ToLower(k) == keyLower {
			if str, ok := v.(string); ok && str != "" {
				return str
			}
		}
	}
	return fallback
}

func pickAggregate(inputs []string) string {
	if len(inputs) == 0 {
		return "no-input"
	}
	if len(inputs) == 1 {
		return truncate(inputs[0], 64)
	}
	return fmt.Sprintf("aggregated-%d-signals", len(inputs))
}

func truncate(input string, limit int) string {
	if len(input) <= limit {
		return input
	}
	return input[:limit] + "..."
}

// collectTools collects available tools from the pipeline nodes
func (s *Service) collectTools(payload graphPayload) []map[string]interface{} {
	tools := make([]map[string]interface{}, 0)
	for _, node := range payload.nodes {
		nodeType := strings.ToLower(node.GetType())
		if strings.Contains(nodeType, "tool") || node.GetCategory() == "Services" {
			tool := map[string]interface{}{
				"type": "function",
				"function": map[string]interface{}{
					"name":        node.GetKey(),
					"description": fmt.Sprintf("%s - %s", node.GetLabel(), node.GetType()),
					"parameters": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"input": map[string]interface{}{
								"type":        "string",
								"description": "Input data for the tool",
							},
						},
					},
				},
			}
			tools = append(tools, tool)
		}
	}
	return tools
}

// executeNode executes a single node with Mistral AI support
func (s *Service) executeNode(ctx context.Context, node *api.PipelineNode, inputs []string, tools []map[string]interface{}) (string, string) {
	category := strings.ToLower(node.GetCategory())
	config := decodeConfig(node.GetConfigJson())
	joined := strings.Join(inputs, "\n")
	nodeType := strings.ToLower(node.GetType())

	switch {
	case nodeType == "trigger" || nodeType == "input-trigger":
		return "completed", joined

	case nodeType == "response" || nodeType == "output-response":
		return "completed", joined

	case category == "llm":
		// Use Mistral AI for LLM nodes
		if s.mistralKey == "" {
			return "completed", fmt.Sprintf("LLM[simulated] response for: %s", truncate(joined, 64))
		}
		return s.executeMistralNode(ctx, node, joined, tools, config)

	case category == "data":
		source := configValue(config, "backend", "data-source")
		collection := configValue(config, "namespace", "default")
		output := fmt.Sprintf("Data[%s] retrieved context from %s", source, collection)
		return "completed", output

	case category == "services":
		service := configValue(config, "service", node.GetType())
		metric := configValue(config, "metric", "quality")
		output := fmt.Sprintf("Service[%s] evaluated metric '%s' => %s", service, metric, pickAggregate(inputs))
		return "completed", output

	case category == "utility":
		sink := configValue(config, "sink", "monitor")
		output := fmt.Sprintf("Utility[%s] recorded %d signals", sink, len(inputs))
		return "completed", output

	default:
		if joined == "" {
			joined = "noop"
		}
		return defaultNodeStatus, fmt.Sprintf("%s passthrough: %s", strings.ToUpper(category), truncate(joined, 64))
	}
}

// executeMistralNode executes an LLM node using Mistral API
func (s *Service) executeMistralNode(ctx context.Context, node *api.PipelineNode, prompt string, tools []map[string]interface{}, config map[string]interface{}) (string, string) {
	// Import будет добавлен после создания клиента
	// Пока возвращаем симуляцию
	model := configValue(config, "model", "mistral-small-latest")
	if prompt == "" {
		prompt = "Hello"
	}

	output := fmt.Sprintf("LLM[%s] response: AI generated answer for '%s'", model, truncate(prompt, 64))
	return "completed", output
}
