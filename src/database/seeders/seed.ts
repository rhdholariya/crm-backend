import { DataSource } from 'typeorm';
import { Role } from '../../roles/entities/role.entity';
import { User } from '../../users/entities/user.entity';
import * as bcrypt from 'bcryptjs';
import { seedFeatures } from './features.seed';

export async function seed(dataSource: DataSource) {
  const roleRepo = dataSource.getRepository(Role);
  const userRepo = dataSource.getRepository(User);

  // Create Admin role
  let adminRole = await roleRepo.findOneBy({ name: 'Admin' });
  if (!adminRole) {
    adminRole = roleRepo.create({ name: 'Admin' });
    await roleRepo.save(adminRole);
    console.log('✓ Admin role created');
  }

  // Create User role
  let userRole = await roleRepo.findOneBy({ name: 'User' });
  if (!userRole) {
    userRole = roleRepo.create({ name: 'User' });
    await roleRepo.save(userRole);
    console.log('✓ User role created');
  }

  // Create admin user
  const adminExists = await userRepo.findOneBy({ email: 'admin@example.com' });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('Admin@123', 10);
    const admin = userRepo.create({
      email: 'admin@example.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      phoneNumber: '+1234567890',
      isActive: true,
      roleId: adminRole.id,
    });
    await userRepo.save(admin);
    console.log('✓ Admin user created (admin@example.com / Admin@123)');
  }

  await seedFeatures(dataSource);
}
