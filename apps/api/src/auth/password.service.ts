import { argon2id, hash, verify } from 'argon2';

export class PasswordService {
  hash(password: string): Promise<string> {
    return hash(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  }

  verify(digest: string, password: string): Promise<boolean> {
    return verify(digest, password);
  }
}
