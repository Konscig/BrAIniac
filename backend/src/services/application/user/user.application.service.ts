import { HttpError } from '../../../common/http-error.js';
import { findUserById } from '../../data/user.service.js';

export async function getUserByIdForSelf(userId: number, requesterUserId: number) {
  if (userId !== requesterUserId) {
    throw new HttpError(403, { error: 'forbidden' });
  }

  const user = await findUserById(userId);
  if (!user) {
    throw new HttpError(404, { error: 'not found' });
  }

  return user;
}
