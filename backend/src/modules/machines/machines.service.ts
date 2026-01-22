import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Machine, MachineStatus } from './entities/machine.entity';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';

@Injectable()
export class MachinesService {
  constructor(
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
  ) {}

  async create(createMachineDto: CreateMachineDto): Promise<Machine> {
    const existing = await this.machineRepository.findOne({
      where: { code: createMachineDto.code },
    });

    if (existing) {
      throw new ConflictException('Machine with this code already exists');
    }

    const machine = this.machineRepository.create({
      ...createMachineDto,
      status: MachineStatus.APPROVED,
    });
    return this.machineRepository.save(machine);
  }

  async createByOperator(
    createMachineDto: CreateMachineDto,
    userId: string,
  ): Promise<Machine> {
    const existing = await this.machineRepository.findOne({
      where: { code: createMachineDto.code },
    });

    if (existing) {
      throw new ConflictException('Machine with this code already exists');
    }

    const machine = this.machineRepository.create({
      ...createMachineDto,
      status: MachineStatus.PENDING,
      createdById: userId,
    });
    return this.machineRepository.save(machine);
  }

  async findAll(activeOnly = true, approvedOnly = true): Promise<Machine[]> {
    const query = this.machineRepository.createQueryBuilder('machine');

    if (activeOnly) {
      query.andWhere('machine.isActive = :isActive', { isActive: true });
    }

    if (approvedOnly) {
      query.andWhere('machine.status = :status', {
        status: MachineStatus.APPROVED,
      });
    }

    return query.orderBy('machine.name', 'ASC').getMany();
  }

  async findAllActive(): Promise<Machine[]> {
    return this.findAll(true, true);
  }

  async findById(id: string): Promise<Machine | null> {
    return this.machineRepository.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<Machine> {
    const machine = await this.findById(id);
    if (!machine) {
      throw new NotFoundException('Machine not found');
    }
    return machine;
  }

  async findByIdWithCreator(id: string): Promise<Machine> {
    const machine = await this.machineRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!machine) {
      throw new NotFoundException('Machine not found');
    }
    return machine;
  }

  async findByCode(code: string): Promise<Machine | null> {
    return this.machineRepository.findOne({ where: { code } });
  }

  async findByCodeOrFail(code: string): Promise<Machine> {
    const machine = await this.findByCode(code);
    if (!machine) {
      throw new NotFoundException('Machine not found');
    }
    return machine;
  }

  async findPending(): Promise<Machine[]> {
    return this.machineRepository.find({
      where: { status: MachineStatus.PENDING },
      relations: ['createdBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async approve(id: string, adminId: string): Promise<Machine> {
    const machine = await this.findByIdOrFail(id);

    if (machine.status !== MachineStatus.PENDING) {
      throw new BadRequestException('Machine is not pending approval');
    }

    machine.status = MachineStatus.APPROVED;
    machine.approvedById = adminId;
    machine.approvedAt = new Date();

    return this.machineRepository.save(machine);
  }

  async reject(id: string, adminId: string, reason: string): Promise<Machine> {
    const machine = await this.findByIdOrFail(id);

    if (machine.status !== MachineStatus.PENDING) {
      throw new BadRequestException('Machine is not pending approval');
    }

    machine.status = MachineStatus.REJECTED;
    machine.approvedById = adminId;
    machine.approvedAt = new Date();
    machine.rejectionReason = reason;

    return this.machineRepository.save(machine);
  }

  async update(
    id: string,
    updateMachineDto: UpdateMachineDto,
  ): Promise<Machine> {
    const machine = await this.findByIdOrFail(id);

    // Check if code is being updated and if it already exists
    if (updateMachineDto.code && updateMachineDto.code !== machine.code) {
      const existing = await this.findByCode(updateMachineDto.code);
      if (existing) {
        throw new ConflictException('Machine with this code already exists');
      }
    }

    Object.assign(machine, updateMachineDto);
    return this.machineRepository.save(machine);
  }

  async deactivate(id: string): Promise<Machine> {
    const machine = await this.findByIdOrFail(id);
    machine.isActive = false;
    return this.machineRepository.save(machine);
  }

  async activate(id: string): Promise<Machine> {
    const machine = await this.findByIdOrFail(id);
    machine.isActive = true;
    return this.machineRepository.save(machine);
  }

  async search(query: string, includeAllStatuses = false): Promise<Machine[]> {
    const qb = this.machineRepository
      .createQueryBuilder('machine')
      .where('machine.isActive = :isActive', { isActive: true });

    if (!includeAllStatuses) {
      qb.andWhere('machine.status = :status', {
        status: MachineStatus.APPROVED,
      });
    }

    qb.andWhere(
      '(machine.code ILIKE :query OR machine.name ILIKE :query OR machine.location ILIKE :query)',
      { query: `%${query}%` },
    );

    return qb.orderBy('machine.name', 'ASC').getMany();
  }
}
