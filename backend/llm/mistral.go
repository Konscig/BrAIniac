package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	MistralAPIBaseURL = "https://api.mistral.ai/v1"
	DefaultModel      = "mistral-small-latest"
	DefaultTimeout    = 60 * time.Second
)

// Tool represents a function that can be called by the LLM
type Tool struct {
	Type     string       `json:"type"`
	Function FunctionSpec `json:"function"`
}

// FunctionSpec describes a callable function
type FunctionSpec struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// Message represents a chat message
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatRequest is the request structure for Mistral chat completion
type ChatRequest struct {
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Tools       []Tool    `json:"tools,omitempty"`
	Temperature float64   `json:"temperature,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
}

// ChatResponse is the response from Mistral API
type ChatResponse struct {
	ID      string   `json:"id"`
	Object  string   `json:"object"`
	Created int64    `json:"created"`
	Model   string   `json:"model"`
	Choices []Choice `json:"choices"`
	Usage   Usage    `json:"usage"`
}

// Choice represents a completion choice
type Choice struct {
	Index        int     `json:"index"`
	Message      Message `json:"message"`
	FinishReason string  `json:"finish_reason"`
}

// Usage represents token usage information
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// Client is a Mistral API client
type Client struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new Mistral API client
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey:  apiKey,
		baseURL: MistralAPIBaseURL,
		httpClient: &http.Client{
			Timeout: DefaultTimeout,
		},
	}
}

// ChatCompletion sends a chat completion request to Mistral API
func (c *Client) ChatCompletion(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	if req.Model == "" {
		req.Model = DefaultModel
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+"/chat/completions",
		bytes.NewReader(reqBody),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var chatResp ChatResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &chatResp, nil
}

// SimpleCompletion is a convenience method for simple text completion
func (c *Client) SimpleCompletion(ctx context.Context, prompt string, model string) (string, error) {
	if model == "" {
		model = DefaultModel
	}

	req := ChatRequest{
		Model: model,
		Messages: []Message{
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}

	resp, err := c.ChatCompletion(ctx, req)
	if err != nil {
		return "", err
	}

	if len(resp.Choices) == 0 {
		return "", errors.New("no choices in response")
	}

	return resp.Choices[0].Message.Content, nil
}

// CompletionWithTools sends a completion request with available tools
func (c *Client) CompletionWithTools(ctx context.Context, prompt string, tools []Tool, model string) (*ChatResponse, error) {
	if model == "" {
		model = DefaultModel
	}

	req := ChatRequest{
		Model: model,
		Messages: []Message{
			{
				Role:    "user",
				Content: prompt,
			},
		},
		Tools: tools,
	}

	return c.ChatCompletion(ctx, req)
}
