import {
  apiRequest,
  AUTH_EXPIRED_EVENT,
  AUTH_EXPIRED_MESSAGE,
  isInvalidOrExpiredTokenResponse
} from "./api";

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(body),
  json: async () => body
}) as Response;

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

test("classifies invalid and expired token 401 responses", () => {
  expect(isInvalidOrExpiredTokenResponse(401, { message: "invalid token" })).toBe(true);
  expect(isInvalidOrExpiredTokenResponse(401, { details: { code: "MCP_INVALID_TOKEN" } })).toBe(true);
  expect(isInvalidOrExpiredTokenResponse(401, { error: "jwt expired" })).toBe(true);
  expect(isInvalidOrExpiredTokenResponse(403, { message: "invalid token" })).toBe(false);
  expect(isInvalidOrExpiredTokenResponse(401, { message: "missing credentials" })).toBe(false);
});

test("clears stale stored tokens and emits auth-expired event for invalid token responses", async () => {
  localStorage.setItem("brainiac.tokens", JSON.stringify({ accessToken: "stale-token" }));
  jest.spyOn(global, "fetch").mockResolvedValue(
    jsonResponse({ ok: false, code: "UNAUTHORIZED", message: "invalid token" }, 401)
  );
  const onAuthExpired = jest.fn();
  window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);

  await expect(apiRequest("/projects")).rejects.toMatchObject({
    status: 401,
    message: AUTH_EXPIRED_MESSAGE
  });

  expect(localStorage.getItem("brainiac.tokens")).toBeNull();
  expect(onAuthExpired).toHaveBeenCalledTimes(1);
  window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
});

test("does not emit auth-expired for unrelated unauthorized API errors", async () => {
  localStorage.setItem("brainiac.tokens", JSON.stringify({ accessToken: "stored-token" }));
  jest.spyOn(global, "fetch").mockResolvedValue(
    jsonResponse({ ok: false, code: "UNAUTHORIZED", message: "missing credentials" }, 401)
  );
  const onAuthExpired = jest.fn();
  window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);

  await expect(apiRequest("/projects")).rejects.toMatchObject({
    status: 401,
    message: "missing credentials"
  });

  expect(localStorage.getItem("brainiac.tokens")).not.toBeNull();
  expect(onAuthExpired).not.toHaveBeenCalled();
  window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
});
