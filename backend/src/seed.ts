import { DataSource } from 'typeorm';
import { User, UserRole } from './modules/users/entities/user.entity';
import { Machine } from './modules/machines/entities/machine.entity';
import 'dotenv/config';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'vendcash',
  password: process.env.DB_PASSWORD || 'vendcash',
  database: process.env.DB_DATABASE || 'vendcash',
  entities: [User, Machine],
  synchronize: true,
});

const machines = [
  { code: '5b7b181f0000', name: 'Кардиология КПП' },
  { code: '6620191f0000', name: 'Кардиология 2 корпус' },
  { code: 'a7ca181f0000', name: 'KIUT CLINIC' },
  { code: '3266181f0000', name: 'American Hospital' },
  { code: '4f9c181f0000', name: 'Grand clinic' },
  { code: '72ac181f0000', name: 'Soliq Yashnobod' },
  { code: '9457181f0000', name: 'KIUT M corp' },
  { code: '2c67181f0000', name: 'SOLIQ OLMAZOR' },
  { code: '1dce181f0000', name: 'KIMYO' },
  { code: '24a8181f0000', name: 'Parus F4' },
  { code: '4eaf181f0000', name: 'Parus F1' },
  { code: 'c7a6181f0000', name: 'DUNYO Supermarket' },
  { code: '17b7181f0000', name: 'ZIYO market' },
];

async function seed() {
  console.log('🌱 Starting seed...');

  await dataSource.initialize();
  console.log('✅ Database connected');

  const userRepository = dataSource.getRepository(User);
  const machineRepository = dataSource.getRepository(Machine);

  // Create admin user
  const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminTelegramId) {
    console.error('❌ ADMIN_TELEGRAM_ID is required!');
    process.exit(1);
  }

  const existingAdmin = await userRepository.findOne({
    where: { telegramId: parseInt(adminTelegramId, 10) },
  });

  if (!existingAdmin) {
    const admin = userRepository.create({
      telegramId: parseInt(adminTelegramId, 10),
      name: process.env.ADMIN_NAME || 'Администратор',
      role: UserRole.ADMIN,
      isActive: true,
    });
    await userRepository.save(admin);
    console.log(`✅ Admin user created: ${admin.name} (TG ID: ${admin.telegramId})`);
  } else {
    console.log(`ℹ️ Admin user already exists: ${existingAdmin.name}`);
  }

  // Create machines
  for (const machineData of machines) {
    const existing = await machineRepository.findOne({
      where: { code: machineData.code },
    });

    if (!existing) {
      const machine = machineRepository.create({
        code: machineData.code,
        name: machineData.name,
        isActive: true,
      });
      await machineRepository.save(machine);
      console.log(`✅ Machine created: ${machine.name} (${machine.code})`);
    } else {
      console.log(`ℹ️ Machine already exists: ${existing.name}`);
    }
  }

  console.log('\n🎉 Seed completed!');
  await dataSource.destroy();
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
