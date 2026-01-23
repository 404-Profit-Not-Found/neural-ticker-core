import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHasOnboardedToUser1769167704527 implements MigrationInterface {
    name = 'AddHasOnboardedToUser1769167704527'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "has_onboarded" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "has_onboarded"`);
    }
}
