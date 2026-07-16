/* =============================================================
   TeamCollab — SQL Server schema
   Run once against a new database (e.g. CREATE DATABASE TeamCollab)
   Covers ALL platform features: org hierarchy, channels/chat,
   mentions, 4-stage tasks, reminders, meetings, notifications, OTP.
   ============================================================= */

CREATE TABLE Departments (
    Id        INT IDENTITY(1,1) PRIMARY KEY,
    Name      NVARCHAR(100) NOT NULL UNIQUE,
    Slug      NVARCHAR(100) NOT NULL UNIQUE,   -- used by @mentions, e.g. @engineering
    HeadId    INT NULL,                        -- FK added after Users exists
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE Users (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(100) NOT NULL,
    Handle       NVARCHAR(50)  NOT NULL UNIQUE, -- used by @mentions, e.g. @kevin
    Email        NVARCHAR(200) NOT NULL UNIQUE,
    Phone        NVARCHAR(20)  NULL UNIQUE,
    PasswordSalt NVARCHAR(64)  NULL,            -- NULL for OTP-only invited users
    PasswordHash NVARCHAR(64)  NULL,            -- SHA256(salt + password), hex
    RoleLevel    NVARCHAR(20)  NOT NULL DEFAULT 'MEMBER', -- ADMIN | DEPT_HEAD | MANAGER | MEMBER
    Active       BIT           NOT NULL DEFAULT 1,
    DepartmentId INT NULL REFERENCES Departments(Id),
    ManagerId    INT NULL REFERENCES Users(Id), -- reporting line: drives escalation + @managers
    InvitedById  INT NULL REFERENCES Users(Id),
    CreatedAt    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

ALTER TABLE Departments
    ADD CONSTRAINT FK_Departments_Head FOREIGN KEY (HeadId) REFERENCES Users(Id);

CREATE TABLE Channels (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    Name         NVARCHAR(100) NOT NULL,
    ChannelType  NVARCHAR(10)  NOT NULL DEFAULT 'PUBLIC',  -- PUBLIC | DM
    DepartmentId INT NULL REFERENCES Departments(Id),
    DmKey        NVARCHAR(50)  NULL UNIQUE,  -- 'minUserId:maxUserId' => one DM per pair
    CreatedAt    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE ChannelMembers (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    ChannelId  INT NOT NULL REFERENCES Channels(Id) ON DELETE CASCADE,
    UserId     INT NOT NULL REFERENCES Users(Id),
    LastReadAt DATETIME2 NULL,               -- drives unread badges
    CONSTRAINT UQ_ChannelMembers UNIQUE (ChannelId, UserId)
);

CREATE TABLE Messages (
    Id        INT IDENTITY(1,1) PRIMARY KEY,
    ChannelId INT NOT NULL REFERENCES Channels(Id) ON DELETE CASCADE,
    AuthorId  INT NOT NULL REFERENCES Users(Id),
    Content   NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Messages_Channel ON Messages(ChannelId, CreatedAt);

CREATE TABLE Mentions (
    Id          INT IDENTITY(1,1) PRIMARY KEY,
    MessageId   INT NOT NULL REFERENCES Messages(Id) ON DELETE CASCADE,
    TargetType  NVARCHAR(20) NOT NULL,  -- USER | DEPARTMENT | ROLE_LEVEL | EVERYONE
    TargetId    INT NULL,
    TargetLabel NVARCHAR(100) NOT NULL
);

CREATE TABLE Meetings (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    Title          NVARCHAR(200) NOT NULL,
    Description    NVARCHAR(MAX) NULL,
    StartsAt       DATETIME2 NOT NULL,
    EndsAt         DATETIME2 NOT NULL,
    Location       NVARCHAR(200) NULL,
    OrganizerId    INT NOT NULL REFERENCES Users(Id),
    ReminderSentAt DATETIME2 NULL,          -- 15-min-before reminder marker
    CreatedAt      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE MeetingAttendees (
    Id        INT IDENTITY(1,1) PRIMARY KEY,
    MeetingId INT NOT NULL REFERENCES Meetings(Id) ON DELETE CASCADE,
    UserId    INT NOT NULL REFERENCES Users(Id),
    Response  NVARCHAR(10) NOT NULL DEFAULT 'PENDING', -- PENDING | ACCEPTED | DECLINED
    CONSTRAINT UQ_MeetingAttendees UNIQUE (MeetingId, UserId)
);

CREATE TABLE Tasks (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    Title           NVARCHAR(300) NOT NULL,
    Description     NVARCHAR(MAX) NULL,
    SourceMessageId INT NULL REFERENCES Messages(Id),  -- "assign message as task"
    AssignerId      INT NOT NULL REFERENCES Users(Id),
    Status          NVARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
                    -- NOT_STARTED | DECISION_MAKING | IN_PROGRESS | COMPLETED
    Priority        NVARCHAR(10) NOT NULL DEFAULT 'MEDIUM', -- LOW | MEDIUM | HIGH | URGENT
    DueDate         DATETIME2 NULL,
    AcknowledgedAt  DATETIME2 NULL,  -- assignee confirmed they saw it (stops escalation)
    CompletedAt     DATETIME2 NULL,  -- stamped on COMPLETED; feeds productivity metrics
    MeetingId       INT NULL REFERENCES Meetings(Id),  -- meeting action item
    CreatedAt       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE TaskAssignees (
    Id       INT IDENTITY(1,1) PRIMARY KEY,
    TaskId   INT NOT NULL REFERENCES Tasks(Id) ON DELETE CASCADE,
    UserId   INT NOT NULL REFERENCES Users(Id),
    Via      NVARCHAR(20) NOT NULL DEFAULT 'DIRECT', -- DIRECT | DEPARTMENT | ROLE_LEVEL
    ViaLabel NVARCHAR(100) NULL,                     -- e.g. 'Engineering', 'Managers'
    CONSTRAINT UQ_TaskAssignees UNIQUE (TaskId, UserId)
);

CREATE TABLE Notifications (
    Id        INT IDENTITY(1,1) PRIMARY KEY,
    UserId    INT NOT NULL REFERENCES Users(Id),
    NotifType NVARCHAR(30) NOT NULL, -- mention | dm | task_assigned | task_updated | reminder | escalation | meeting_invite | meeting_reminder
    Title     NVARCHAR(300) NOT NULL,
    Body      NVARCHAR(500) NULL,
    Link      NVARCHAR(300) NULL,
    ReadAt    DATETIME2 NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Notifications_User ON Notifications(UserId, ReadAt, CreatedAt);

CREATE TABLE Reminders (
    Id     INT IDENTITY(1,1) PRIMARY KEY,
    TaskId INT NOT NULL REFERENCES Tasks(Id) ON DELETE CASCADE,
    Kind   NVARCHAR(20) NOT NULL, -- DUE_SOON | OVERDUE | ESCALATION
    SentAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Reminders UNIQUE (TaskId, Kind)
);

CREATE TABLE OtpCodes (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    Identifier NVARCHAR(200) NOT NULL, -- normalized phone or lowercased email
    CodeHash   NVARCHAR(64)  NOT NULL, -- SHA256, hex
    ExpiresAt  DATETIME2 NOT NULL,
    Attempts   INT NOT NULL DEFAULT 0,
    ConsumedAt DATETIME2 NULL,
    CreatedAt  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_OtpCodes_Identifier ON OtpCodes(Identifier, CreatedAt);
