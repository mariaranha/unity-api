import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';

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

router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const cls = await prisma.class.findUnique({
      where: { id },
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

    if (!cls) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const formatted = {
      id: cls.id,
      name: cls.name,
      description: cls.description,
      date: cls.date,
      capacity: cls.capacity,
      teacher: cls.teacher,
      teacherId: cls.teacherId,
      confirmedReservations: cls.Reservation.length,
      availableSpots: cls.capacity - cls.Reservation.length,
      waitlistCount: cls.Waitlist.length,
    };

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching class:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  const { name, description, teacherId, capacity, date } = req.body;

  if (!name || !description || !teacherId || !capacity || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const newClass = await prisma.class.create({
      data: {
        name,
        description,
        date: new Date(date),
        capacity,
        teacherId,
      },
    });

    res.status(201).json(newClass);
  } catch (error) {
    console.error('Error creating class:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.$transaction([
      prisma.reservation.deleteMany({
        where: { class_id: id },
      }),
      prisma.waitlist.deleteMany({
        where: { class_id: id },
      }),
      prisma.class.delete({
        where: { id },
      }),
    ]);

    res.json({ message: 'Class deleted successfully' });
  } catch (error) {
    console.error('Error deleting class:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, description, teacherId, capacity, date } = req.body;

  try {
    const existingClass = await prisma.class.findUnique({
      where: { id },
    });

    if (!existingClass) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const updatedClass = await prisma.class.update({
      where: { id },
      data: {
        name: name ?? undefined,
        description: description ?? undefined,
        teacherId: teacherId ?? undefined,
        capacity: capacity ?? undefined,
        date: date ? new Date(date) : undefined,
      },
    });

    res.json(updatedClass);
  } catch (error) {
    console.error('Error updating class:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/book', authMiddleware, async (req, res) => {
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

router.post('/:classId/cancel', authMiddleware, async (req, res) => {
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
