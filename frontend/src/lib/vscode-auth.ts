export function readVscodeAuthState(search: string): string | null {
  const value = new URLSearchParams(search).get("vscode_state");
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function shouldRenderAuthPage(isAuthenticated: boolean, search: string): boolean {
  return !isAuthenticated || Boolean(readVscodeAuthState(search));
}

export async function completeVscodeAuthState(
  state: string | null,
  accessToken: string,
  complete: (state: string, accessToken: string) => Promise<unknown>,
  onError: (error: unknown) => void = () => undefined
): Promise<boolean> {
  if (!state) {
    return false;
  }

  try {
    await complete(state, accessToken);
    return true;
  } catch (error) {
    onError(error);
    return false;
  }
}
