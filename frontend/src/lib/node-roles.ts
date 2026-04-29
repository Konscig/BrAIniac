export type NodeRoleName = "source" | "transform" | "control" | "sink";

export type NodeRoleVisual = {
  label: string;
  badge: string;
  frame: string;
  handle: string;
  selectedRing: string;
  runningFrame: string;
};

export const NODE_ROLE_VISUALS: Record<NodeRoleName, NodeRoleVisual> = {
  source: {
    label: "вход",
    badge: "bg-cyan-400/16 text-cyan-100",
    frame: "border-cyan-400/45 bg-cyan-400/7",
    handle: "bg-cyan-300",
    selectedRing: "ring-cyan-300/70",
    runningFrame: "shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_22px_rgba(103,232,249,0.18)]"
  },
  transform: {
    label: "обработка",
    badge: "bg-indigo-400/16 text-indigo-100",
    frame: "border-indigo-400/42 bg-indigo-400/7",
    handle: "bg-indigo-300",
    selectedRing: "ring-indigo-300/70",
    runningFrame: "shadow-[0_0_0_1px_rgba(165,180,252,0.45),0_0_22px_rgba(165,180,252,0.16)]"
  },
  control: {
    label: "ветвление",
    badge: "bg-amber-400/16 text-amber-100",
    frame: "border-amber-400/45 bg-amber-400/7",
    handle: "bg-amber-300",
    selectedRing: "ring-amber-300/70",
    runningFrame: "shadow-[0_0_0_1px_rgba(252,211,77,0.45),0_0_22px_rgba(252,211,77,0.16)]"
  },
  sink: {
    label: "выход",
    badge: "bg-emerald-400/16 text-emerald-100",
    frame: "border-emerald-400/45 bg-emerald-400/7",
    handle: "bg-emerald-300",
    selectedRing: "ring-emerald-300/70",
    runningFrame: "shadow-[0_0_0_1px_rgba(110,231,183,0.45),0_0_22px_rgba(110,231,183,0.16)]"
  }
};

export function normalizeNodeRole(role: string): NodeRoleName {
  if (role === "source" || role === "transform" || role === "control" || role === "sink") {
    return role;
  }
  return "transform";
}

export function getNodeRoleVisual(role: string): NodeRoleVisual {
  return NODE_ROLE_VISUALS[normalizeNodeRole(role)];
}
