import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Machine } from './entities/machine.entity';
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

    const machine = this.machineRepository.create(createMachineDto);
    return this.machineRepository.save(machine);
  }

  async findAll(activeOnly = true): Promise<Machine[]> {
    const query = this.machineRepository.createQueryBuilder('machine');

    if (activeOnly) {
      query.andWhere('machine.isActive = :isActive', { isActive: true });
    }

    return query.orderBy('machine.name', 'ASC').getMany();
  }

  async findAllActive(): Promise<Machine[]> {
    return this.findAll(true);
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

  async update(id: string, updateMachineDto: UpdateMachineDto): Promise<Machine> {
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

  async search(query: string): Promise<Machine[]> {
    return this.machineRepository
      .createQueryBuilder('machine')
      .where('machine.isActive = :isActive', { isActive: true })
      .andWhere(
        '(machine.code ILIKE :query OR machine.name ILIKE :query OR machine.location ILIKE :query)',
        { query: `%${query}%` },
      )
      .orderBy('machine.name', 'ASC')
      .getMany();
  }
}
