import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { generateToken } from '../utils/jwt';
import { authMiddleware } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';

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

router.post(
    '/register/admin',
    authMiddleware,
    adminMiddleware,
    async (req, res) => {
        const { name, email, username, password, birth_date, role } = req.body;

        if (!name || !email || !username || !password || !birth_date || !role) {
            return res.status(400).json({
                error: 'Missing required fields',
            });
        }

        if (!['admin', 'teacher'].includes(role)) {
            return res.status(400).json({
                error: 'Invalid role. Allowed roles: admin, teacher',
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
                role,
            },
        });

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                username: user.username,
                role: user.role,
            },
        });
    }
);

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
