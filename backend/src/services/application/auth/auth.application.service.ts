import { HttpError } from '../../../common/http-error.js';
import { login, signup } from '../../core/auth.service.js';

type Credentials = { email: string; password: string };

export async function signupAndIssueTokens(data: Credentials) {
  try {
    await signup(data);
  } catch (err: any) {
    if (err?.message === 'user exists') {
      throw new HttpError(409, { error: 'user exists' });
    }
    throw err;
  }

  return login(data);
}

export async function loginAndIssueTokens(data: Credentials) {
  try {
    return await login(data);
  } catch {
    throw new HttpError(401, { error: 'invalid credentials' });
  }
}
