/*
  Warnings:

  - Added the required column `capacity` to the `Class` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "capacity" INTEGER NOT NULL;
