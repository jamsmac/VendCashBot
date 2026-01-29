import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokens1737600000000 implements MigrationInterface {
  name = 'AddRefreshTokens1737600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token" varchar NOT NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "expires_at" TIMESTAMP NOT NULL,
        "is_revoked" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "refresh_tokens" ADD CONSTRAINT "UQ_refresh_tokens_token" UNIQUE ("token");
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user" ON "refresh_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_token" ON "refresh_tokens" ("token")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_token"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_user"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}
