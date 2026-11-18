import { historyList, historyValues, writeWithHistory, type HistoryWrite } from './profileHistory';
import { createSchema, createYoga } from 'graphql-yoga';
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

async function requireOwner(context: GqlContext, id: string) {
  const owner = await context.userDb.prepare('SELECT user_id FROM user_profiles WHERE id = ?').bind(id).first<{ user_id: string }>();
  if (!context.userId || owner?.user_id !== context.userId) throw new Error('Unauthorized');
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
        value: JSON
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

      type HistoryPoint { recordedAt: Float! closed: Boolean! disabled: Boolean before: Float keys: [String!] requestId: String }
      input HistoryRevision { key: String! revision: Int! }
      type Query {
        profileHistory(id: ID!, before: Float): [HistoryPoint!]!
        profileHistoryPreview(id: ID!, at: Float!): [KeyValue!]!

        me: User
        profile(id: ID!): Profile
        profileAllData(id: ID!): [KeyValue!]!
      }

      type Mutation {
        restoreProfileHistory(profileId: ID!, at: Float!, revisions: [HistoryRevision!]!, requestId: String!, fingerprint: String!): Float!

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
        profileHistory: async (_: unknown, { id, before }: { id: string; before?: number }, context: GqlContext) => {
          await requireOwner(context, id);
          return historyList(context.userDb, id, before);
        },
        profileHistoryPreview: async (_: unknown, { id, at }: { id: string; at: number }, context: GqlContext) => {
          await requireOwner(context, id);
          return (await historyValues(context.userDb, id, at)).map((row) => ({ ...row, revision: 0, updatedAt: 0 }));
        },
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
        restoreProfileHistory: async (
          _: unknown,
          args: { profileId: string; at: number; revisions: Array<{ key: string; revision: number }>; requestId: string; fingerprint: string },
          context: GqlContext,
        ) => {
          await requireOwner(context, args.profileId);
          if (!args.revisions.length || args.revisions.length > 500 || new Set(args.revisions.map((row) => row.key)).size !== args.revisions.length) throw new Error('Invalid keys');
          const values = await historyValues(context.userDb, args.profileId, args.at);
          const latest = await historyList(context.userDb, args.profileId);
          const changes = args.revisions.map((row) => ({
            key: row.key,
            baseRevision: row.revision,
            value: values.find((value) => value.key === row.key)?.value ?? null,
            schemaVersion: values.find((value) => value.key === row.key)?.schemaVersion ?? 1,
          }));
          return (
            await writeWithHistory(context.userDb, args.profileId, changes, {
              before: latest[0]?.recordedAt ?? args.at,
              keys: args.revisions.map((row) => row.key),
              requestId: args.requestId,
              sourceAt: args.at,
              fingerprint: args.fingerprint,
            })
          ).recordedAt;
        },
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

          const current = await userDb.prepare('SELECT revision FROM profile_data WHERE profile_id = ? AND key = ?').bind(profileId, key).first<{ revision: number }>();
          const changes: HistoryWrite[] = [{ key, value, schemaVersion, baseRevision: baseRevision ?? current?.revision ?? 0 }];
          const result = await writeWithHistory(userDb, profileId, changes);
          if (result.results[0]?.status !== 'APPLIED') throw new Error('SYNC_CONFLICT');
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

          if (new Set(changes.map((change) => change.key)).size !== changes.length) throw new Error('Duplicate key');
          return (await writeWithHistory(userDb, profileId, changes)).results;
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
      logging: 'warn',
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
