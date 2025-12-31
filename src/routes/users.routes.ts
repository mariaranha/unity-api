import { Router } from 'express';
import { prisma } from '../prisma';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:userId/reservations', async (req, res) => {
  const { userId } = req.params;

  try {
    const confirmedReservations = await prisma.reservation.findMany({
      where: {
        user_id: userId,
        status: 'confirmed',
      },
      include: {
        class: {
          include: {
            teacher: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const confirmed = confirmedReservations.map((r) => ({
      classId: r.class.id,
      className: r.class.name,
      date: r.class.date,
      teacher: r.class.teacher,
    }));

    res.json({
      confirmed,
    });

  } catch (err) {
    console.error('Error fetching user reservations:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/teachers', async (req, res) => {
  const teachers = await prisma.user.findMany({
    where: {
      role: 'teacher',
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  res.json(teachers);
});

export default router;