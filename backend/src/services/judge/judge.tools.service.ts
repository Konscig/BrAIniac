import type { Tool } from "@mistralai/mistralai/models/components";
export const tools: Tool[] =  [
    {
        type: "function",
        function: {
            name: "getNode",
            description: "Use node to check graph lines or what node was used, how pipeline was built, etc. You have id of the node, category, type, label, status and optionally config of the node.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string" },
                },
                required: ["id"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "getMetrics",
            description: "You can check metrics for nodes or for pipeline as a whole. You have id of the ran task to get metrics for.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string" },
                },
                required: ["id"],
            },
        },
    },
    /* Пока хз что с запусками TODO
    {
        type: "function",
        function: {
            name: "runTask",
            description: "You can run whole task to see how it works.",
            parameters: {
                type: "object",
                properties: {
                    pipelineId: { type: "string" },
                    projectId: { type: "string" },
                },
                required: [],
            },
        },
    },
    */
    {
        type: "function",
        function: {
            name: "getLogs",
            description: "You can see logs from nodes execution and trunk data between nodes. You have id of the ran task to get logs for.",
            parameters: {
                type: "object",
                properties: {
                    id: { type: "string" }
                },
                required: ["id"],
            },
        },
    },
];