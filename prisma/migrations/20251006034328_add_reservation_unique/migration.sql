/*
  Warnings:

  - A unique constraint covering the columns `[class_id,user_id]` on the table `Reservation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Reservation_class_id_user_id_key" ON "Reservation"("class_id", "user_id");
