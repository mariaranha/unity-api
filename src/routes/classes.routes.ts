import { Router } from 'express';
import { prisma } from '../prisma';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        Reservation: {
          where: {
            status: 'confirmed',
          },
        },
        Waitlist: {
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    const formatted = classes.map((cls) => ({
      id: cls.id,
      name: cls.name,
      description: cls.description,
      date: cls.date,
      capacity: cls.capacity,
      teacher: cls.teacher,
      confirmedReservations: cls.Reservation.length,
      availableSpots: cls.capacity - cls.Reservation.length,
      waitlistCount: cls.Waitlist.length,
      waitlist: cls.Waitlist,
      reservation: cls.Reservation,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/book', async (req, res) => {
  const classId = req.params.id;
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  try {
    const classData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        Reservation: {
          where: { status: 'confirmed' },
        },
        Waitlist: true,
      },
    });

    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const existingReservation = await prisma.reservation.findUnique({
      where: {
        class_user_unique: {
          class_id: classId,
          user_id: user_id,
        },
      },
    });

    if (existingReservation) {
      return res
        .status(400)
        .json({ error: 'User already booked this class' });
    }

    const existingWaitlist = await prisma.waitlist.findUnique({
      where: {
        waitlist_user_class_unique: {
          user_id: user_id,
          class_id: classId,
        },
      },
    });

    if (existingWaitlist) {
      return res
        .status(400)
        .json({ error: 'User already in waitlist' });
    }

    const confirmedCount = classData.Reservation.length;

    if (confirmedCount < classData.capacity) {
      const reservation = await prisma.reservation.create({
        data: {
          class_id: classId,
          user_id: user_id,
          status: 'confirmed',
        },
      });

      return res.status(201).json({
        message: 'Reservation confirmed',
        reservation,
      });
    }

    const lastPosition =
      classData.Waitlist.length > 0
        ? Math.max(...classData.Waitlist.map(w => w.position))
        : 0;

    const waitlist = await prisma.waitlist.create({
      data: {
        class_id: classId,
        user_id: user_id,
        position: lastPosition + 1,
      },
    });

    return res.status(201).json({
      message: 'Class is full, user added to waitlist',
      waitlist,
    });
  } catch (error) {
    console.error('Error booking class:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:classId/cancel', async (req, res) => {
  const { classId } = req.params;
  const { userId } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: {
          class_id: classId,
          user_id: userId,
          status: 'confirmed',
        },
      });

      if (!reservation) {
        throw new Error('Reservation not found or already cancelled');
      }

      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: 'cancelled' },
      });

      const nextInLine = await tx.waitlist.findFirst({
        where: { class_id: classId },
        orderBy: { position: 'asc' },
      });

      let promotedReservation = null;

      if (nextInLine) {
        promotedReservation = await tx.reservation.create({
          data: {
            class_id: classId,
            user_id: nextInLine.user_id,
            status: 'confirmed',
          },
        });

        await tx.waitlist.delete({
          where: { id: nextInLine.id },
        });

        await tx.waitlist.updateMany({
          where: {
            class_id: classId,
            position: { gt: nextInLine.position },
          },
          data: {
            position: {
              decrement: 1,
            },
          },
        });
      }

      return {
        cancelledReservation: reservation,
        promotedReservation,
      };
    });

    res.json({
      message: 'Reservation cancelled successfully',
      ...result,
    });
  } catch (error: any) {
    console.error('Cancel error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
