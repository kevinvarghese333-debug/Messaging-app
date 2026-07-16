/* Optional demo data for trying the app. All passwords are: password123
   Skip this in production — the first user who registers becomes ADMIN. */

INSERT INTO Departments (Name, Slug) VALUES ('Engineering','engineering'), ('Marketing','marketing'), ('Sales','sales');

DECLARE @eng INT = (SELECT Id FROM Departments WHERE Slug='engineering');
DECLARE @mkt INT = (SELECT Id FROM Departments WHERE Slug='marketing');
DECLARE @sls INT = (SELECT Id FROM Departments WHERE Slug='sales');
DECLARE @salt NVARCHAR(64) = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
DECLARE @hash NVARCHAR(64) = '494435d92fd71012bba17c90d86d31e21e8ff123a3bdde2c7c515d5f631518fc';

INSERT INTO Users (Name, Handle, Email, Phone, PasswordSalt, PasswordHash, RoleLevel, DepartmentId) VALUES
 ('Alice Admin','alice','alice@demo.co','+919000000001',@salt,@hash,'ADMIN',NULL),
 ('Eva Engle','eva','eva@demo.co','+919000000002',@salt,@hash,'DEPT_HEAD',@eng),
 ('Mia Moore','mia','mia@demo.co','+919000000006',@salt,@hash,'DEPT_HEAD',@mkt),
 ('Sam Singh','sam','sam@demo.co','+919000000009',@salt,@hash,'DEPT_HEAD',@sls);

DECLARE @eva INT = (SELECT Id FROM Users WHERE Handle='eva');
DECLARE @mia INT = (SELECT Id FROM Users WHERE Handle='mia');
DECLARE @sam INT = (SELECT Id FROM Users WHERE Handle='sam');

INSERT INTO Users (Name, Handle, Email, Phone, PasswordSalt, PasswordHash, RoleLevel, DepartmentId, ManagerId) VALUES
 ('Mark Mendez','mark','mark@demo.co','+919000000003',@salt,@hash,'MANAGER',@eng,@eva),
 ('Max Malik','max','max@demo.co','+919000000007',@salt,@hash,'MANAGER',@mkt,@mia),
 ('Sara Silva','sara','sara@demo.co','+919000000010',@salt,@hash,'MEMBER',@sls,@sam);

DECLARE @mark INT = (SELECT Id FROM Users WHERE Handle='mark');
DECLARE @max INT = (SELECT Id FROM Users WHERE Handle='max');

INSERT INTO Users (Name, Handle, Email, Phone, PasswordSalt, PasswordHash, RoleLevel, DepartmentId, ManagerId) VALUES
 ('Dan Diaz','dan','dan@demo.co','+919000000004',@salt,@hash,'MEMBER',@eng,@mark),
 ('Dana Doyle','dana','dana@demo.co','+919000000005',@salt,@hash,'MEMBER',@eng,@mark),
 ('Molly Mason','molly','molly@demo.co','+919000000008',@salt,@hash,'MEMBER',@mkt,@max);

UPDATE Departments SET HeadId=@eva WHERE Id=@eng;
UPDATE Departments SET HeadId=@mia WHERE Id=@mkt;
UPDATE Departments SET HeadId=@sam WHERE Id=@sls;

INSERT INTO Channels (Name, ChannelType, DepartmentId) VALUES
 ('general','PUBLIC',NULL), ('engineering','PUBLIC',@eng), ('marketing','PUBLIC',@mkt), ('sales','PUBLIC',@sls);

-- everyone joins #general; departments join their channel
INSERT INTO ChannelMembers (ChannelId, UserId)
SELECT (SELECT Id FROM Channels WHERE Name='general'), Id FROM Users;
INSERT INTO ChannelMembers (ChannelId, UserId)
SELECT c.Id, u.Id FROM Channels c JOIN Users u ON u.DepartmentId = c.DepartmentId WHERE c.DepartmentId IS NOT NULL;

INSERT INTO Messages (ChannelId, AuthorId, Content) VALUES
 ((SELECT Id FROM Channels WHERE Name='general'), (SELECT Id FROM Users WHERE Handle='alice'),
  'Welcome to TeamCollab! Mention people with @handle, departments with @engineering, or leadership with @managers.');
