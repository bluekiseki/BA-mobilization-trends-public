import { createSchema, createYoga } from 'graphql-yoga';
import { validateProfileDataValue } from '../../app/schemas/profileDataValidation';
import { assertCanCreateKey } from './profileDataLimits';
import { MAX_PROFILES_PER_USER, sanitizeProfileName, toGraphQLProfileServer } from '../../app/utils/profileServer';

type D1Database = Cloudflare.Env['ba_user'];

type ServerCtx = { userDb: D1Database };
type UserCtx = { userId: string | null };
type GqlContext = ServerCtx & UserCtx;
type ProfileSource = {
  server: string;
  isDefault?: boolean;
  is_default?: number;
  sortOrder?: number;
  sort_order?: number;
  avatarStudentId?: number | null;
  avatar_student_id?: number | null;
  createdAt?: Date | number | string;
  created_at?: number;
  updatedAt?: Date | number | string;
  updated_at?: number;
};

function parseStoredJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** Accepts null (clear) or a positive integer student id. */
function sanitizeAvatarStudentId(raw: number | null): number | null {
  if (raw === null) return null;
  if (!Number.isInteger(raw) || raw <= 0) throw new Error('Invalid avatarStudentId');
  return raw;
}

// The client batches at most one change per sync key, so this is far above normal use.
const MAX_SYNC_CHANGES = 500;

let yogaInstance: ReturnType<typeof createYoga<ServerCtx, UserCtx>> | null = null;

function createGraphQLSchema() {
  return createSchema<GqlContext>({
    typeDefs: `
      scalar DateTime
      scalar JSON

      enum ServerType {
        JP
        KR
        TW
        ASIA
        GLOBAL
        NA
      }

      type User {
        id: ID!
        username: String!
        email: String
        profiles: [Profile!]!
      }

      type Profile {
        id: ID!
        name: String!
        server: ServerType!
        isDefault: Boolean!
        sortOrder: Int!
        avatarStudentId: Int
        data: ProfileData
        createdAt: DateTime!
        updatedAt: DateTime!
      }

      type ProfileData {
        theme: String
        equipmentPlan: JSON
        eventPlans: JSON
        growthPlans: JSON
        gachaStrategies: JSON
        gachaCustomPercentiles: JSON
        updatedAt: DateTime
      }

      input CreateProfileInput {
        name: String!
        server: ServerType!
      }

      input UpdateProfileInput {
        name: String
        server: ServerType
        avatarStudentId: Int
      }

      input SyncProfileDataChangeInput {
        key: String!
        value: JSON!
        schemaVersion: Int!
        baseRevision: Int!
      }

      enum SyncProfileDataStatus {
        APPLIED
        CONFLICT
        REJECTED
      }

      type SyncProfileDataResult {
        key: String!
        status: SyncProfileDataStatus!
        revision: Int!
        serverValue: JSON
        schemaVersion: Int
        updatedAt: Int
        message: String
      }

      type KeyValue {
        key: String!
        value: JSON
        schemaVersion: Int!
        revision: Int!
        updatedAt: Int!
      }

      type Query {
        me: User
        profile(id: ID!): Profile
        profileAllData(id: ID!): [KeyValue!]!
      }

      type Mutation {
        createProfile(input: CreateProfileInput!): Profile!
        updateProfile(id: ID!, input: UpdateProfileInput!): Profile!
        deleteProfile(id: ID!): Boolean!
        upsertProfileData(profileId: ID!, key: String!, value: JSON!, schemaVersion: Int, baseRevision: Int): Boolean!
        syncProfileData(profileId: ID!, changes: [SyncProfileDataChangeInput!]!): [SyncProfileDataResult!]!
      }
    `,
    resolvers: {
      Profile: {
        server: (profile: ProfileSource) => toGraphQLProfileServer(profile.server),
        isDefault: (profile: ProfileSource) => profile.isDefault ?? profile.is_default === 1,
        sortOrder: (profile: ProfileSource) => profile.sortOrder ?? profile.sort_order ?? 0,
        avatarStudentId: (profile: ProfileSource) => profile.avatarStudentId ?? profile.avatar_student_id ?? null,
        createdAt: (profile: ProfileSource) => profile.createdAt ?? profile.created_at,
        updatedAt: (profile: ProfileSource) => profile.updatedAt ?? profile.updated_at,
      },
      Query: {
        me: async (_: unknown, __: unknown, context: GqlContext) => {
          const { userId, userDb } = context;
          if (!userId) return null;

          const user = await userDb.prepare('SELECT id, email, name FROM user WHERE id = ?').bind(userId).first<{ id: string; email: string; name: string }>();

          if (!user) return null;

          const profiles = await userDb.prepare('SELECT * FROM user_profiles WHERE user_id = ? ORDER BY sort_order').bind(userId).all();

          return {
            id: user.id,
            username: user.name || user.id.slice(0, 8),
            email: user.email,
            profiles: profiles.results || [],
          };
        },

        profileAllData: async (_: unknown, { id }: { id: string }, context: GqlContext) => {
          const { userId, userDb } = context;
          const profile = await userDb.prepare('SELECT user_id FROM user_profiles WHERE id = ?').bind(id).first<{ user_id: string }>();

          if (!profile || profile.user_id !== userId) {
            throw new Error('Unauthorized');
          }

          const rows = await userDb
            .prepare('SELECT key, value, schema_version, revision, updated_at FROM profile_data WHERE profile_id = ?')
            .bind(id)
            .all<{ key: string; value: string; schema_version: number; revision: number; updated_at: number }>();

          return (rows.results || []).map((row) => ({
            key: row.key,
            schemaVersion: row.schema_version,
            revision: row.revision,
            updatedAt: row.updated_at,
            value: (() => {
              try {
                return JSON.parse(row.value) as unknown;
              } catch {
                return row.value;
              }
            })(),
          }));
        },

        profile: async (_: unknown, { id }: { id: string }, context: GqlContext) => {
          const { userId, userDb } = context;
          const profile = await userDb.prepare('SELECT * FROM user_profiles WHERE id = ?').bind(id).first();

          if (!profile) return null;

          if (profile.user_id !== userId) {
            throw new Error('Unauthorized');
          }

          const profileData = await userDb.prepare('SELECT key, value FROM profile_data WHERE profile_id = ?').bind(id).all<{ key: string; value: string }>();

          const data: Record<string, unknown> = {};
          (profileData.results || []).forEach((row) => {
            try {
              data[row.key] = JSON.parse(row.value);
            } catch {
              data[row.key] = row.value;
            }
          });

          return {
            ...profile,
            isDefault: profile.is_default === 1,
            sortOrder: profile.sort_order,
            data,
          };
        },
      },

      Mutation: {
        createProfile: async (_: unknown, { input }: { input: { name: string; server: string } }, context: GqlContext) => {
          const { userId, userDb } = context;
          if (!userId) throw new Error('Unauthorized');

          const name = sanitizeProfileName(input.name);

          const existing = await userDb.prepare('SELECT COUNT(*) AS c FROM user_profiles WHERE user_id = ?').bind(userId).first<{ c: number }>();
          if ((existing?.c ?? 0) >= MAX_PROFILES_PER_USER) throw new Error(`Profile limit reached (${MAX_PROFILES_PER_USER})`);

          const profileId = 'prof_' + Math.random().toString(36).slice(2);
          const now = Math.floor(Date.now() / 1000);

          await userDb
            .prepare('INSERT INTO user_profiles (id, user_id, name, server, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)')
            .bind(profileId, userId, name, input.server.toLowerCase(), now, now)
            .run();

          return {
            id: profileId,
            name,
            server: input.server.toLowerCase(),
            isDefault: false,
            sortOrder: 0,
            data: null,
            createdAt: new Date(now * 1000),
            updatedAt: new Date(now * 1000),
          };
        },

        updateProfile: async (_: unknown, { id, input }: { id: string; input: { name?: string; server?: string; avatarStudentId?: number | null } }, context: GqlContext) => {
          const { userId, userDb } = context;
          if (!userId) throw new Error('Unauthorized');

          const profile = await userDb.prepare('SELECT user_id FROM user_profiles WHERE id = ?').bind(id).first<{ user_id: string }>();

          if (!profile || profile.user_id !== userId) {
            throw new Error('Unauthorized');
          }

          const now = Math.floor(Date.now() / 1000);
          const updates: string[] = [];
          const values: unknown[] = [];

          if (input.name !== undefined) {
            updates.push('name = ?');
            values.push(sanitizeProfileName(input.name));
          }
          if (input.server !== undefined) {
            updates.push('server = ?');
            values.push(input.server.toLowerCase());
          }
          if (input.avatarStudentId !== undefined) {
            updates.push('avatar_student_id = ?');
            values.push(sanitizeAvatarStudentId(input.avatarStudentId)); // null clears the avatar
          }

          updates.push('updated_at = ?');
          values.push(now);
          values.push(id);

          await userDb
            .prepare(`UPDATE user_profiles SET ${updates.join(', ')} WHERE id = ?`)
            .bind(...values)
            .run();

          return userDb.prepare('SELECT * FROM user_profiles WHERE id = ?').bind(id).first<ProfileSource>();
        },

        deleteProfile: async (_: unknown, { id }: { id: string }, context: GqlContext) => {
          const { userId, userDb } = context;
          if (!userId) throw new Error('Unauthorized');

          const profile = await userDb.prepare('SELECT user_id FROM user_profiles WHERE id = ?').bind(id).first<{ user_id: string }>();

          if (!profile || profile.user_id !== userId) {
            throw new Error('Unauthorized');
          }

          await userDb.prepare('DELETE FROM user_profiles WHERE id = ?').bind(id).run();
          return true;
        },

        upsertProfileData: async (
          _: unknown,
          { profileId, key, value, schemaVersion = 1, baseRevision }: { profileId: string; key: string; value: unknown; schemaVersion?: number; baseRevision?: number },
          context: GqlContext,
        ) => {
          const { userId, userDb } = context;
          if (!userId) throw new Error('Unauthorized');

          const profile = await userDb.prepare('SELECT user_id FROM user_profiles WHERE id = ?').bind(profileId).first<{ user_id: string }>();

          if (!profile || profile.user_id !== userId) {
            throw new Error('Unauthorized');
          }

          validateProfileDataValue(key, value);

          const now = Math.floor(Date.now() / 1000);
          const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);

          if (baseRevision !== undefined) {
            const existing = await userDb.prepare('SELECT revision FROM profile_data WHERE profile_id = ? AND key = ?').bind(profileId, key).first<{ revision: number }>();

            if (!existing) {
              if (baseRevision !== 0) throw new Error('SYNC_CONFLICT');
              await assertCanCreateKey(userDb, profileId);
              try {
                await userDb
                  .prepare('INSERT INTO profile_data (profile_id, key, value, schema_version, updated_at, revision) VALUES (?, ?, ?, ?, ?, 1)')
                  .bind(profileId, key, jsonValue, schemaVersion, now)
                  .run();
              } catch {
                throw new Error('SYNC_CONFLICT');
              }
              return true;
            }

            const result = await userDb
              .prepare('UPDATE profile_data SET value = ?, schema_version = ?, updated_at = ?, revision = revision + 1 WHERE profile_id = ? AND key = ? AND revision = ?')
              .bind(jsonValue, schemaVersion, now, profileId, key, baseRevision)
              .run();

            if (result.meta.changes !== 1) throw new Error('SYNC_CONFLICT');
            return true;
          }

          const present = await userDb.prepare('SELECT 1 AS present FROM profile_data WHERE profile_id = ? AND key = ?').bind(profileId, key).first();
          if (!present) await assertCanCreateKey(userDb, profileId);

          await userDb
            .prepare(
              `INSERT INTO profile_data (profile_id, key, value, schema_version, updated_at, revision)
               VALUES (?, ?, ?, ?, ?, 1)
               ON CONFLICT(profile_id, key) DO UPDATE SET
                 value = excluded.value,
                 schema_version = excluded.schema_version,
                 updated_at = excluded.updated_at,
                 revision = profile_data.revision + 1`,
            )
            .bind(profileId, key, jsonValue, schemaVersion, now)
            .run();

          return true;
        },

        syncProfileData: async (
          _: unknown,
          {
            profileId,
            changes,
          }: {
            profileId: string;
            changes: Array<{ key: string; value: unknown; schemaVersion: number; baseRevision: number }>;
          },
          context: GqlContext,
        ) => {
          const { userId, userDb } = context;
          if (!userId) throw new Error('Unauthorized');
          if (changes.length > MAX_SYNC_CHANGES) throw new Error('Too many changes');

          const profile = await userDb.prepare('SELECT user_id FROM user_profiles WHERE id = ?').bind(profileId).first<{ user_id: string }>();
          if (!profile || profile.user_id !== userId) throw new Error('Unauthorized');

          const results: Array<{
            key: string;
            status: 'APPLIED' | 'CONFLICT' | 'REJECTED';
            revision: number;
            serverValue?: unknown;
            schemaVersion?: number;
            updatedAt?: number;
            message?: string;
          }> = [];

          for (const change of changes) {
            // Validate per key so one oversized/invalid value cannot block the rest of the batch.
            try {
              validateProfileDataValue(change.key, change.value);
            } catch (error) {
              results.push({ key: change.key, status: 'REJECTED', revision: 0, message: error instanceof Error ? error.message : String(error) });
              continue;
            }
            const now = Math.floor(Date.now() / 1000);
            const jsonValue = typeof change.value === 'string' ? change.value : JSON.stringify(change.value);
            const existing = await userDb
              .prepare('SELECT value, schema_version, revision, updated_at FROM profile_data WHERE profile_id = ? AND key = ?')
              .bind(profileId, change.key)
              .first<{ value: string; schema_version: number; revision: number; updated_at: number }>();

            if (!existing) {
              if (change.baseRevision !== 0) {
                results.push({ key: change.key, status: 'CONFLICT', revision: 0, serverValue: null, schemaVersion: 1, updatedAt: 0 });
                continue;
              }
              try {
                await assertCanCreateKey(userDb, profileId);
              } catch (error) {
                results.push({ key: change.key, status: 'REJECTED', revision: 0, message: error instanceof Error ? error.message : String(error) });
                continue;
              }

              try {
                await userDb
                  .prepare('INSERT INTO profile_data (profile_id, key, value, schema_version, updated_at, revision) VALUES (?, ?, ?, ?, ?, 1)')
                  .bind(profileId, change.key, jsonValue, change.schemaVersion, now)
                  .run();
                results.push({ key: change.key, status: 'APPLIED', revision: 1, updatedAt: now });
              } catch {
                const current = await userDb
                  .prepare('SELECT value, schema_version, revision, updated_at FROM profile_data WHERE profile_id = ? AND key = ?')
                  .bind(profileId, change.key)
                  .first<{ value: string; schema_version: number; revision: number; updated_at: number }>();
                results.push({
                  key: change.key,
                  status: 'CONFLICT',
                  revision: current?.revision ?? 0,
                  serverValue: current ? parseStoredJson(current.value) : null,
                  schemaVersion: current?.schema_version ?? 1,
                  updatedAt: current?.updated_at ?? 0,
                });
              }
              continue;
            }

            const result = await userDb
              .prepare('UPDATE profile_data SET value = ?, schema_version = ?, updated_at = ?, revision = revision + 1 WHERE profile_id = ? AND key = ? AND revision = ?')
              .bind(jsonValue, change.schemaVersion, now, profileId, change.key, change.baseRevision)
              .run();

            if (result.meta.changes === 1) {
              results.push({ key: change.key, status: 'APPLIED', revision: change.baseRevision + 1, updatedAt: now });
              continue;
            }

            const current = await userDb
              .prepare('SELECT value, schema_version, revision, updated_at FROM profile_data WHERE profile_id = ? AND key = ?')
              .bind(profileId, change.key)
              .first<{ value: string; schema_version: number; revision: number; updated_at: number }>();
            results.push({
              key: change.key,
              status: 'CONFLICT',
              revision: current?.revision ?? existing.revision,
              serverValue: current ? parseStoredJson(current.value) : null,
              schemaVersion: current?.schema_version ?? existing.schema_version,
              updatedAt: current?.updated_at ?? existing.updated_at,
            });
          }

          return results;
        },
      },

      DateTime: {
        serialize: (value: unknown) => (value instanceof Date ? value.toISOString() : value),
        parseValue: (value: unknown) => new Date(value as string),
      },

      JSON: {
        serialize: (value: unknown) => value,
        parseValue: (value: unknown) => value,
      },
    },
  });
}

export function getOrCreateYogaServer(allowedOrigins: string[]) {
  if (!yogaInstance) {
    const schema = createGraphQLSchema();
    yogaInstance = createYoga<ServerCtx, UserCtx>({
      schema,
      // Exact allowlist instead of Yoga's default of reflecting any request Origin.
      cors: { origin: allowedOrigins, credentials: true },
      context: ({ request, userDb }) => ({
        userId: request.headers.get('x-user-id'),
        userDb,
      }),
    });
  }
  return yogaInstance;
}
