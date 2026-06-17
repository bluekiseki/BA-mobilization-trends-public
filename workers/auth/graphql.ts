import { createSchema, createYoga } from 'graphql-yoga';
import { validateProfileDataValue } from '../../app/schemas/profileDataValidation';

type D1Database = Cloudflare.Env['ba_user'];

type ServerCtx = { userDb: D1Database };
type UserCtx = { userId: string | null };
type GqlContext = ServerCtx & UserCtx;

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
      }

      input ProfileDataInput {
        theme: String
        equipmentPlan: JSON
        eventPlans: JSON
        growthPlans: JSON
        gachaStrategies: JSON
        gachaCustomPercentiles: JSON
      }

      type KeyValue {
        key: String!
        value: JSON
        schemaVersion: Int!
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
        upsertProfileData(profileId: ID!, key: String!, value: JSON!, schemaVersion: Int): Boolean!
        upsertProfileDataBatch(profileId: ID!, data: ProfileDataInput!): Boolean!
      }
    `,
    resolvers: {
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

          const rows = await userDb.prepare('SELECT key, value, schema_version FROM profile_data WHERE profile_id = ?').bind(id).all<{ key: string; value: string; schema_version: number }>();

          return (rows.results || []).map((row) => ({
            key: row.key,
            schemaVersion: row.schema_version,
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

          const profileId = 'prof_' + Math.random().toString(36).slice(2);
          const now = Math.floor(Date.now() / 1000);

          await userDb
            .prepare('INSERT INTO user_profiles (id, user_id, name, server, is_default, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)')
            .bind(profileId, userId, input.name, input.server.toLowerCase(), now, now)
            .run();

          return {
            id: profileId,
            name: input.name,
            server: input.server,
            isDefault: false,
            sortOrder: 0,
            data: null,
            createdAt: new Date(now * 1000),
            updatedAt: new Date(now * 1000),
          };
        },

        updateProfile: async (_: unknown, { id, input }: { id: string; input: { name?: string; server?: string } }, context: GqlContext) => {
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
            values.push(input.name);
          }
          if (input.server !== undefined) {
            updates.push('server = ?');
            values.push(input.server.toLowerCase());
          }

          updates.push('updated_at = ?');
          values.push(now);
          values.push(id);

          await userDb
            .prepare(`UPDATE user_profiles SET ${updates.join(', ')} WHERE id = ?`)
            .bind(...values)
            .run();

          const updated = await userDb.prepare('SELECT * FROM user_profiles WHERE id = ?').bind(id).first();

          return { ...updated, isDefault: updated?.is_default === 1 };
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

        upsertProfileData: async (_: unknown, { profileId, key, value, schemaVersion = 1 }: { profileId: string; key: string; value: unknown; schemaVersion?: number }, context: GqlContext) => {
          const { userId, userDb } = context;
          if (!userId) throw new Error('Unauthorized');

          const profile = await userDb.prepare('SELECT user_id FROM user_profiles WHERE id = ?').bind(profileId).first<{ user_id: string }>();

          if (!profile || profile.user_id !== userId) {
            throw new Error('Unauthorized');
          }

          validateProfileDataValue(key, value);

          const now = Math.floor(Date.now() / 1000);
          const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);

          await userDb
            .prepare('INSERT OR REPLACE INTO profile_data (profile_id, key, value, schema_version, updated_at) VALUES (?, ?, ?, ?, ?)')
            .bind(profileId, key, jsonValue, schemaVersion, now)
            .run();

          return true;
        },

        upsertProfileDataBatch: async (_: unknown, { profileId, data }: { profileId: string; data: Record<string, unknown> }, context: GqlContext) => {
          const { userId, userDb } = context;
          if (!userId) throw new Error('Unauthorized');

          const profile = await userDb.prepare('SELECT user_id FROM user_profiles WHERE id = ?').bind(profileId).first<{ user_id: string }>();

          if (!profile || profile.user_id !== userId) {
            throw new Error('Unauthorized');
          }

          const now = Math.floor(Date.now() / 1000);

          for (const [key, value] of Object.entries(data)) {
            if (value === undefined || value === null) continue;
            validateProfileDataValue(key, value);
            const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
            await userDb.prepare('INSERT OR REPLACE INTO profile_data (profile_id, key, value, schema_version, updated_at) VALUES (?, ?, ?, 1, ?)').bind(profileId, key, jsonValue, now).run();
          }

          return true;
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

export function getOrCreateYogaServer() {
  if (!yogaInstance) {
    const schema = createGraphQLSchema();
    yogaInstance = createYoga<ServerCtx, UserCtx>({
      schema,
      context: ({ request, userDb }) => ({
        userId: request.headers.get('x-user-id'),
        userDb,
      }),
    });
  }
  return yogaInstance;
}
