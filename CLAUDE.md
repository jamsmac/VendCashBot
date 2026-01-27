# CLAUDE.md - AI Assistant Guide for VendCashBot

## Project Overview

VendCashBot is a **vending machine collection tracking system** with:
- **Backend**: NestJS REST API + Telegram Bot (grammY)
- **Frontend**: React SPA with Vite
- **Database**: PostgreSQL 15 with TypeORM
- **Cache**: Redis 7 for sessions and caching
- **Real-time**: Socket.IO for notifications

The system allows operators to report cash collections from vending machines via Telegram, which managers then verify and track through a web dashboard.

## Tech Stack

### Backend (Node.js 20+)
- **Framework**: NestJS 10.x
- **ORM**: TypeORM 0.3.19
- **Database**: PostgreSQL 15
- **Cache**: Redis 7 (cache-manager)
- **Auth**: Passport.js + JWT
- **Bot**: grammY 1.21.1
- **WebSocket**: Socket.IO 4.8.3
- **Logging**: Winston with daily rotation
- **Validation**: class-validator + class-transformer

### Frontend
- **Framework**: React 18.2
- **Build**: Vite 7.3.1
- **Styling**: Tailwind CSS 3.4.1
- **State**: Zustand 4.4.7
- **Data Fetching**: React Query (@tanstack/react-query)
- **Forms**: react-hook-form
- **Routing**: React Router DOM 6.x

## Directory Structure

```
VendCashBot/
├── backend/
│   ├── src/
│   │   ├── modules/              # Feature modules
│   │   │   ├── auth/             # Telegram OAuth & JWT
│   │   │   ├── users/            # User management
│   │   │   ├── invites/          # Employee invitations
│   │   │   ├── machines/         # Vending machines
│   │   │   ├── collections/      # Core business logic
│   │   │   ├── reports/          # Analytics & exports
│   │   │   ├── settings/         # System settings
│   │   │   └── finance/          # Bank deposits
│   │   ├── telegram/             # Telegram bot integration
│   │   ├── notifications/        # Socket.IO gateway
│   │   ├── health/               # Health checks
│   │   ├── cache/                # Redis caching
│   │   ├── common/               # Shared guards, decorators
│   │   ├── config/               # Configuration
│   │   └── migrations/           # TypeORM migrations
│   ├── test/                     # E2E tests
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/                # Page components
│   │   ├── components/           # Shared components
│   │   ├── api/                  # API client modules
│   │   ├── contexts/             # React context (Zustand stores)
│   │   ├── hooks/                # Custom hooks
│   │   └── App.tsx               # Routes
│   └── Dockerfile
├── docs/                         # Documentation
├── docker-compose.yml            # Production
└── docker-compose.dev.yml        # Development
```

## Development Setup

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Telegram Bot Token (from @BotFather)

### Quick Start
```bash
# Start infrastructure
docker-compose -f docker-compose.dev.yml up -d postgres redis

# Backend
cd backend
cp ../.env.example .env  # Configure environment
npm install
npm run migration:run
npm run start:dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Environment Variables (Required)
```env
DB_PASSWORD=<your_password>
JWT_SECRET=<min_32_chars>
TELEGRAM_BOT_TOKEN=<from_botfather>
ADMIN_TELEGRAM_ID=<your_telegram_id>
FRONTEND_URL=<production_url>
VITE_API_URL=<api_base_url>
```

## Common Commands

### Backend
```bash
npm run start:dev         # Development with hot-reload
npm run build             # Compile TypeScript
npm run lint              # ESLint with auto-fix
npm run test              # Unit tests
npm run test:e2e          # End-to-end tests
npm run migration:generate src/migrations/MigrationName  # New migration
npm run migration:run     # Apply migrations
npm run migration:revert  # Revert last migration
```

### Frontend
```bash
npm run dev               # Vite dev server (port 5173)
npm run build             # Production build
npm run lint              # ESLint
npm run preview           # Preview production build
```

## Code Conventions

### NestJS Backend

#### Module Structure
Each feature module follows this pattern:
```
modules/feature/
├── feature.module.ts       # Module definition
├── feature.controller.ts   # HTTP routes
├── feature.service.ts      # Business logic
├── dto/                    # Request/response DTOs
│   ├── create-feature.dto.ts
│   └── update-feature.dto.ts
└── entities/
    └── feature.entity.ts   # TypeORM entity
```

#### Naming Conventions
- **Files**: kebab-case (`user-profile.service.ts`)
- **Classes**: PascalCase (`UserProfileService`)
- **Methods**: camelCase (`findByTelegramId()`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_COLLECTION_AMOUNT`)
- **DTOs**: PascalCase with suffix (`CreateUserDto`)

#### Decorators Usage
```typescript
// Controller example
@Controller('api/collections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionsController {
  @Get()
  @Roles(Role.MANAGER, Role.ADMIN)
  findAll(@CurrentUser() user: User) {}

  @Post()
  @Roles(Role.OPERATOR)
  create(@Body() dto: CreateCollectionDto) {}
}
```

#### Guards & Decorators
- `@Public()` - Skip authentication
- `@Roles(Role.ADMIN)` - Require specific roles
- `@CurrentUser()` - Inject authenticated user
- `JwtAuthGuard` - Validate JWT token
- `RolesGuard` - Check user roles

### React Frontend

#### Component Pattern
```typescript
// Functional components with TypeScript
interface Props {
  machineId: string;
  onSubmit: (data: FormData) => void;
}

export function CollectionForm({ machineId, onSubmit }: Props) {
  const { register, handleSubmit } = useForm();
  // ...
}
```

#### API Client Pattern
```typescript
// api/collections.ts
import { apiClient } from './client';

export const collectionsApi = {
  getAll: () => apiClient.get<Collection[]>('/collections'),
  create: (data: CreateCollectionDto) => apiClient.post('/collections', data),
  receive: (id: string, amount: number) =>
    apiClient.patch(`/collections/${id}/receive`, { amount }),
};
```

#### State Management (Zustand)
```typescript
// contexts/AuthContext.ts
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    { name: 'vendcash-auth' }
  )
);
```

## Architecture Patterns

### API Response Format
```typescript
// Success
{ data: T, message?: string }

// Error (handled by NestJS exception filters)
{ statusCode: number, message: string, error: string }
```

### Authentication Flow
1. User authenticates via Telegram OAuth
2. Backend verifies Telegram hash
3. JWT access token + refresh token issued
4. Refresh token rotation on each refresh
5. Tokens stored in localStorage

### Real-time Notifications
```typescript
// Backend emits
this.notificationsGateway.emit('collection_created', payload);

// Frontend listens
socket.on('collection_created', (data) => {
  toast.success('New collection reported');
  queryClient.invalidateQueries(['collections']);
});
```

### User Roles
- **OPERATOR**: Field workers who collect cash
- **MANAGER**: Verify and receive collections
- **ADMIN**: Full system access + user management

## Database & Migrations

### Entity Patterns
```typescript
@Entity('collections')
export class Collection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: CollectionStatus })
  status: CollectionStatus;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'operator_id' })
  operator: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

### Creating Migrations
```bash
# Generate from entity changes
npm run migration:generate src/migrations/AddNewField

# Run migrations
npm run migration:run
```

### Key Entities
- `User` - System users with Telegram integration
- `Machine` - Vending machines with locations
- `Collection` - Cash collection records
- `CollectionHistory` - Audit trail
- `Invite` - Employee invitation codes
- `RefreshToken` - JWT refresh tokens
- `BankDeposit` - Bank deposit tracking

## API Development Guidelines

### Adding a New Endpoint

1. **Create DTO** in `dto/` folder:
```typescript
export class CreateFeatureDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsNumber()
  amount?: number;
}
```

2. **Add Service Method**:
```typescript
async create(dto: CreateFeatureDto, userId: string) {
  const entity = this.repository.create({ ...dto, createdBy: userId });
  return this.repository.save(entity);
}
```

3. **Add Controller Route**:
```typescript
@Post()
@Roles(Role.ADMIN)
async create(@Body() dto: CreateFeatureDto, @CurrentUser() user: User) {
  return this.service.create(dto, user.id);
}
```

### Swagger Documentation
API docs available at `/api/docs` when running. Add decorators:
```typescript
@ApiTags('collections')
@ApiOperation({ summary: 'Create collection' })
@ApiResponse({ status: 201, type: Collection })
```

## Frontend Guidelines

### Adding a New Page

1. **Create Page Component** in `pages/`:
```typescript
export function NewFeaturePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['features'],
    queryFn: () => featuresApi.getAll(),
  });

  if (isLoading) return <Spinner />;
  return <div>...</div>;
}
```

2. **Add Route** in `App.tsx`:
```typescript
<Route path="/features" element={<NewFeaturePage />} />
```

3. **Add Navigation** in `Layout.tsx` sidebar

### Styling
- Use Tailwind CSS utility classes
- Dark mode: use `dark:` prefix variants
- Responsive: use `sm:`, `md:`, `lg:` breakpoints
- Custom colors defined in `tailwind.config.js`

## Testing Guidelines

### Backend Unit Tests
```typescript
// *.spec.ts files
describe('CollectionsService', () => {
  let service: CollectionsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [CollectionsService, /* mocks */],
    }).compile();
    service = module.get(CollectionsService);
  });

  it('should create collection', async () => {
    const result = await service.create(dto, userId);
    expect(result).toBeDefined();
  });
});
```

### E2E Tests
```typescript
// test/*.e2e-spec.ts
describe('CollectionsController (e2e)', () => {
  it('/api/collections (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/collections')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});
```

## Important Files

### Configuration
- `backend/src/config/configuration.ts` - Environment config
- `backend/src/config/data-source.ts` - TypeORM datasource
- `backend/src/config/logger.config.ts` - Winston logger
- `frontend/vite.config.ts` - Vite configuration
- `frontend/tailwind.config.js` - Tailwind theme

### Entry Points
- `backend/src/main.ts` - Backend bootstrap
- `frontend/src/main.tsx` - React entry
- `backend/src/telegram/telegram.service.ts` - Bot setup

### Common Modifications
- Adding API endpoint: `backend/src/modules/*/`
- Adding page: `frontend/src/pages/`
- Adding component: `frontend/src/components/`
- Database changes: Create migration in `backend/src/migrations/`

## Common Tasks for AI Assistants

### When Adding Features
1. Check existing patterns in similar modules
2. Create proper DTOs with validation
3. Add appropriate role guards
4. Include audit logging if needed
5. Update frontend API client
6. Add tests for critical paths

### When Fixing Bugs
1. Reproduce the issue first
2. Check related service and controller logic
3. Verify database queries and relationships
4. Test edge cases

### When Modifying Database
1. Never modify entities and expect auto-sync (disabled)
2. Always create migrations for schema changes
3. Test migrations on clean database
4. Consider backward compatibility

### Security Considerations
- Validate all user input with class-validator
- Use role guards on all protected endpoints
- Never expose internal errors to users
- Check IDOR vulnerabilities (user accessing other's data)
- Sanitize Excel imports

### Code Quality Checks
```bash
# Before committing
cd backend && npm run lint && npm run test
cd frontend && npm run lint && npm run build
```

## Git Workflow

- Main branch: `main`
- Feature branches: `claude/<description>-<id>` or `feature/<description>`
- Always run linting before commits
- Write descriptive commit messages

## Deployment

The project deploys to Railway via GitHub Actions:
- Push to `main` triggers deployment
- Backend and frontend deploy as separate services
- PostgreSQL and Redis managed separately

### Docker Commands
```bash
# Full stack locally
docker-compose up -d

# View logs
docker-compose logs -f backend

# Rebuild after changes
docker-compose build backend
```

## Troubleshooting

### Common Issues
1. **JWT_SECRET too short**: Must be 32+ characters in production
2. **Redis connection failed**: Check REDIS_HOST/REDIS_PORT
3. **Telegram bot not responding**: Verify TELEGRAM_BOT_TOKEN
4. **Migration failed**: Check database connection and existing schema
5. **CORS errors**: Verify FRONTEND_URL matches actual frontend domain

### Logs Location
- Development: Console output
- Production: `logs/` directory with daily rotation
  - `application-YYYY-MM-DD.log` - All logs
  - `error-YYYY-MM-DD.log` - Errors only
