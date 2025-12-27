import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { generateToken } from '../utils/jwt';

const router = Router();

router.post('/register', async (req, res) => {
    const { name, email, username, password, birth_date } = req.body;

    if (!name || !email || !username || !password || !birth_date) {
        return res.status(400).json({
            error: 'Missing required fields',
        });
    }

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [{ email }, { username }],
        },
    });

    if (existingUser) {
        return res.status(409).json({
            error: 'Email or username already in use',
        });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
        data: {
            name,
            email,
            username,
            password_hash,
            birth_date: new Date(birth_date),
            role: 'student',
        },
    });

    const token = generateToken({
        id: user.id,
        role: user.role,
    });

    res.status(201).json({
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        },
    });
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({
        where: { email },
    });

    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(
        password,
        user.password_hash
    );

    if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({
        id: user.id,
        role: user.role,
    });

    res.json({
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        },
    });
});

export default router;
