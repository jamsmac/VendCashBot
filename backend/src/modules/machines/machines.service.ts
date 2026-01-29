import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual, IsNull, Or } from 'typeorm';
import { Machine, MachineStatus } from './entities/machine.entity';
import { MachineLocation } from './entities/machine-location.entity';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import {
  CreateMachineLocationDto,
  UpdateMachineLocationDto,
} from './dto/machine-location.dto';

@Injectable()
export class MachinesService {
  constructor(
    @InjectRepository(Machine)
    private readonly machineRepository: Repository<Machine>,
    @InjectRepository(MachineLocation)
    private readonly locationRepository: Repository<MachineLocation>,
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
      status: MachineStatus.APPROVED,
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

  async remove(id: string): Promise<void> {
    const machine = await this.findByIdOrFail(id);

    // Delete related locations first
    await this.locationRepository.delete({ machineId: id });

    await this.machineRepository.remove(machine);
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

  // ========== Machine Locations ==========

  async getLocations(machineId: string): Promise<MachineLocation[]> {
    return this.locationRepository.find({
      where: { machineId },
      order: { validFrom: 'DESC' },
    });
  }

  async getCurrentLocation(machineId: string): Promise<MachineLocation | null> {
    return this.locationRepository.findOne({
      where: { machineId, isCurrent: true },
    });
  }

  async getLocationForDate(
    machineId: string,
    date: Date,
  ): Promise<MachineLocation | null> {
    const dateStr = date.toISOString().split('T')[0];

    return this.locationRepository
      .createQueryBuilder('loc')
      .where('loc.machineId = :machineId', { machineId })
      .andWhere('loc.validFrom <= :date', { date: dateStr })
      .andWhere('(loc.validTo IS NULL OR loc.validTo >= :date)', { date: dateStr })
      .orderBy('loc.validFrom', 'DESC')
      .getOne();
  }

  async addLocation(
    machineId: string,
    dto: CreateMachineLocationDto,
  ): Promise<MachineLocation> {
    await this.findByIdOrFail(machineId);

    // If this is set as current, unset other current locations
    if (dto.isCurrent) {
      await this.locationRepository.update(
        { machineId, isCurrent: true },
        { isCurrent: false },
      );
    }

    const location = this.locationRepository.create({
      machineId,
      address: dto.address,
      latitude: dto.latitude,
      longitude: dto.longitude,
      validFrom: new Date(dto.validFrom),
      validTo: dto.validTo ? new Date(dto.validTo) : null,
      isCurrent: dto.isCurrent ?? false,
    });

    return this.locationRepository.save(location);
  }

  async updateLocation(
    locationId: string,
    dto: UpdateMachineLocationDto,
  ): Promise<MachineLocation> {
    const location = await this.locationRepository.findOne({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    // If setting as current, unset other current locations
    if (dto.isCurrent && !location.isCurrent) {
      await this.locationRepository.update(
        { machineId: location.machineId, isCurrent: true },
        { isCurrent: false },
      );
    }

    Object.assign(location, {
      ...dto,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : location.validFrom,
      validTo: dto.validTo ? new Date(dto.validTo) : location.validTo,
    });

    return this.locationRepository.save(location);
  }

  async deleteLocation(locationId: string): Promise<void> {
    const location = await this.locationRepository.findOne({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    await this.locationRepository.remove(location);
  }

  async setCurrentLocation(locationId: string): Promise<MachineLocation> {
    const location = await this.locationRepository.findOne({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    // Unset current for all locations of this machine
    await this.locationRepository.update(
      { machineId: location.machineId },
      { isCurrent: false },
    );

    // Set this one as current
    location.isCurrent = true;
    return this.locationRepository.save(location);
  }
}
