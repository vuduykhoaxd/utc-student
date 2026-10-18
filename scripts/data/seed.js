/**
 * Seed data
 * Deterministic demo dataset for the mock API layer.
 *
 * Everything time-sensitive is generated relative to "now" at module load, so
 * the demo always looks current no matter when it is opened.
 */

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const now = Date.now();
const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Timestamp `days`/`hours` in the past. */
const ago = (days = 0, hours = 0) => now - days * DAY - hours * HOUR;

/** Timestamp `days` in the future. */
const ahead = (days = 0, hours = 0) => now + days * DAY + hours * HOUR;

/** Avatar gradient palette index, stable per id. */
export const AVATAR_PALETTES = [
  ['var(--brand-400)', 'var(--brand-700)'],
  ['var(--violet-400)', 'var(--violet-600)'],
  ['var(--accent-400)', 'var(--accent-600)'],
  ['var(--signal-400)', 'var(--signal-600)'],
  ['var(--success-400)', 'var(--accent-600)'],
  ['var(--danger-400)', 'var(--signal-500)'],
];

/* -------------------------------------------------------------------------- */
/* Students                                                                    */
/* -------------------------------------------------------------------------- */

export const students = [
  {
    id: 'u1',
    studentId: '2251010234',
    password: '123456',
    fullName: 'Nguyễn Thị Mai Anh',
    role: 'Sinh viên',
    faculty: 'Khoa Cơ khí',
    major: 'Công nghệ Cơ khí',
    cohort: 'K22',
    className: 'CK22-03',
    email: '2251010234@sv.utc.edu.vn',
    phone: '0912 345 678',
    status: 'active',
    birthDate: '2003-04-12',
    address: 'Số 54 Triệu Khúc, Đống Đa, Hà Nội',
    schoolEmail: '2251010234@sv.utc.edu.vn',
    scholar: 'Học bổng Xuất sắc',
    bio: 'Kỹ sư cơ khí đang yêu. Đam mê thiết kế CAD, chế tạo linh kiện in 3D và giải pháp bền vững. Tìm nhóm đồ án CAD ở học kỳ này nhé! #CAD #KỹthuậtCơkhí',
    avatarIndex: 0,
    presence: 'online',
  },
  {
    id: 'u2',
    studentId: '2251010567',
    password: '123456',
    fullName: 'Trần Quốc Bảo',
    role: 'Sinh viên',
    faculty: 'Khoa Cơ khí',
    major: 'Công nghệ Cơ khí',
    cohort: 'K22',
    className: 'CK22-03',
    email: '2251010567@sv.utc.edu.vn',
    phone: '0987 654 321',
    status: 'active',
    birthDate: '2002-11-30',
    address: 'Cầu Giấy, Hà Nội',
    schoolEmail: '2251010567@sv.utc.edu.vn',
    scholar: 'Không',
    bio: 'Chuyên gia SolidWorks, mô phỏng Ansys. Sẵn sàng chia sẻ tài liệu ôn thi.',
    avatarIndex: 1,
    presence: 'online',
  },
  {
    id: 'u3',
    studentId: '2251010788',
    password: '123456',
    fullName: 'Lê Hoàng Long',
    role: 'Sinh viên',
    faculty: 'Khoa Điện - Điện tử',
    major: 'Điện tử - Viễn thông',
    cohort: 'K22',
    className: 'DTV22-01',
    email: '2251010788@sv.utc.edu.vn',
    phone: '0966 112 233',
    status: 'active',
    birthDate: '2003-01-08',
    address: 'Hà Đông, Hà Nội',
    schoolEmail: '2251010788@sv.utc.edu.vn',
    scholar: 'Học bổng Khuyến khích',
    bio: 'Mạch in, Arduino và điều khiển tự động. Đang làm đồ án điều khiển tốc độ động cơ DC.',
    avatarIndex: 2,
    presence: 'online',
  },
  {
    id: 'u4',
    studentId: '2251010912',
    password: '123456',
    fullName: 'Phạm Thu Trang',
    role: 'Sinh viên',
    faculty: 'Khoa Công nghệ thông tin & Truyền thông',
    major: 'Khoa học máy tính',
    cohort: 'K22',
    className: 'CNTT22-02',
    email: '2251010912@sv.utc.edu.vn',
    phone: '0903 445 566',
    status: 'active',
    birthDate: '2002-08-19',
    address: 'Hoàng Mai, Hà Nội',
    schoolEmail: '2251010912@sv.utc.edu.vn',
    scholar: 'Không',
    bio: 'Front-end & UI. Đang học React, TypeScript, muốn làm một sản phẩm cho sinh viên trường mình.',
    avatarIndex: 3,
    presence: 'away',
  },
  {
    id: 'u5',
    studentId: '2251010344',
    password: '123456',
    fullName: 'Đỗ Anh Tuấn',
    role: 'Sinh viên',
    faculty: 'Khoa Cơ khí',
    major: 'Công nghệ Cơ khí',
    cohort: 'K22',
    className: 'CK22-03',
    email: '2251010344@sv.utc.edu.vn',
    phone: '0938 778 899',
    status: 'active',
    birthDate: '2001-12-05',
    address: 'Long Biên, Hà Nội',
    schoolEmail: '2251010344@sv.utc.edu.vn',
    scholar: 'Không',
    bio: 'Chuyên gia CAM và gia công CNC. Có máy phay CNC ở Hà Nội, ai cần thực hành thì liên hệ.',
    avatarIndex: 4,
    presence: 'offline',
  },
  {
    id: 'u6',
    studentId: '2251010671',
    password: '123456',
    fullName: 'Vũ Khánh Linh',
    role: 'Sinh viên',
    faculty: 'Khoa Kinh tế',
    major: 'Quản trị kinh doanh',
    cohort: 'K22',
    className: 'KT22-01',
    email: '2251010671@sv.utc.edu.vn',
    phone: '0975 202 303',
    status: 'active',
    birthDate: '2003-05-23',
    address: 'Ba Đình, Hà Nội',
    schoolEmail: '2251010671@sv.utc.edu.vn',
    scholar: 'Học bổng Xuất sắc',
    bio: 'Marketing & khởi nghiệp. Tìm đồng đội làm dự án khởi nghiệp sinh viên cuối năm.',
    avatarIndex: 5,
    presence: 'online',
  },
  {
    id: 'u7',
    studentId: '2251010455',
    password: '123456',
    fullName: 'Hoàng Gia Huy',
    role: 'Sinh viên',
    faculty: 'Khoa Giao thông vận tải',
    major: 'Quản lý giao thông vận tải',
    cohort: 'K22',
    className: 'GTVT22-04',
    email: '2251010455@sv.utc.edu.vn',
    phone: '0889 123 456',
    status: 'active',
    birthDate: '2002-02-17',
    address: 'Thanh Xuân, Hà Nội',
    schoolEmail: '2251010455@sv.utc.edu.vn',
    scholar: 'Không',
    bio: 'Mô phỏng giao thông VISSIM, phần mềm TransCAD. Có kinh nghiệm thực tận ở Viện Nghiên cứu GTVT.',
    avatarIndex: 1,
    presence: 'away',
  },
  {
    id: 'u8',
    studentId: '2251011020',
    password: '123456',
    fullName: 'Phan Minh Khoa',
    role: 'Lớp trưởng lớp CK22-03',
    faculty: 'Khoa Cơ khí',
    major: 'Công nghệ Cơ khí',
    cohort: 'K22',
    className: 'CK22-03',
    email: '2251011020@sv.utc.edu.vn',
    phone: '0911 909 090',
    status: 'active',
    birthDate: '2002-09-14',
    address: 'Đống Đa, Hà Nội',
    schoolEmail: '2251011020@sv.utc.edu.vn',
    scholar: 'Học bổng Trưởng lớp',
    bio: 'Lớp trưởng CK22-03. Liên hệ mọi thông tin về lớp, lịch học, tài liệu tập huấn.',
    avatarIndex: 0,
    presence: 'online',
  },
  {
    id: 'u9',
    studentId: '2251010863',
    password: '123456',
    fullName: 'Đỗ Ngọc Hân',
    role: 'Sinh viên',
    faculty: 'Khoa Công nghệ thông tin & Truyền thông',
    major: 'Hệ thống thông tin',
    cohort: 'K22',
    className: 'CNTT22-02',
    email: '2251010863@sv.utc.edu.vn',
    phone: '0993 111 222',
    status: 'active',
    birthDate: '2003-06-27',
    address: 'Cầu Giấy, Hà Nội',
    schoolEmail: '2251010863@sv.utc.edu.vn',
    scholar: 'Không',
    bio: 'Phân tích dữ liệu, SQL và Power BI. Sẵn sàng review tài liệu ôn thi cho nhóm.',
    avatarIndex: 2,
    presence: 'offline',
  },
  {
    id: 'u10',
    studentId: '2251010288',
    password: '123456',
    fullName: 'Lý Thị Hồng Nhung',
    role: 'Sinh viên',
    faculty: 'Khoa Ngoại ngữ',
    major: 'Tiếng Anh',
    cohort: 'K22',
    className: 'NN22-01',
    email: '2251010288@sv.utc.edu.vn',
    phone: '0945 666 777',
    status: 'active',
    birthDate: '2002-10-03',
    address: 'Thanh Xuân, Hà Nội',
    schoolEmail: '2251010288@sv.utc.edu.vn',
    scholar: 'Học bổng Xuất sắc',
    bio: 'Chuyên gia IELTS 8.0. Chia sẻ tài liệu luyện thi và mẹo học từ vựng mỗi ngày.',
    avatarIndex: 3,
    presence: 'online',
  },
];

/** Credentials surfaced on the login screen for demo purposes. */
export const demoAccounts = students.slice(0, 3).map((s) => ({
  fullName: s.fullName,
  studentId: s.studentId,
  password: s.password,
  avatarIndex: s.avatarIndex,
  role: s.role,
}));

/* -------------------------------------------------------------------------- */
/* Courses & schedule                                                          */
/* -------------------------------------------------------------------------- */

export const courses = [
  {
    id: 'c1',
    code: 'TT0101',
    name: 'Toán giải tích 1',
    teacher: 'TS. Nguyễn Văn Hùng',
    credits: 4,
    colorIndex: 1,
    room: 'A201',
    attendance: 92,
    sessions: 32,
    attended: 29,
  },
  {
    id: 'c2',
    code: 'ML0103',
    name: 'Vật lý đại cương 1',
    teacher: 'TS. Trần Minh Đức',
    credits: 4,
    colorIndex: 4,
    room: 'B105',
    attendance: 88,
    sessions: 32,
    attended: 28,
  },
  {
    id: 'c3',
    code: 'TN0101',
    name: 'Lập trình C',
    teacher: 'TS. Lê Anh Tuấn',
    credits: 3,
    colorIndex: 3,
    room: 'C401',
    attendance: 96,
    sessions: 24,
    attended: 23,
  },
  {
    id: 'c4',
    code: 'XH0101',
    name: 'Triết học Mác - Lênin',
    teacher: 'TS. Phan Thị Thu',
    credits: 3,
    colorIndex: 2,
    room: 'A108',
    attendance: 79,
    sessions: 24,
    attended: 19,
  },
  {
    id: 'c5',
    code: 'ML0302',
    name: 'Mạch điện tử 1',
    teacher: 'TS. Đỗ Hữu Thành',
    credits: 4,
    colorIndex: 5,
    room: 'D302',
    attendance: 85,
    sessions: 32,
    attended: 27,
  },
  {
    id: 'c6',
    code: 'GD0101',
    name: 'Giáo dục thể chất 1',
    teacher: 'ThS. Đỗ Thanh Hà',
    credits: 1,
    colorIndex: 6,
    room: 'Sân thể thao',
    attendance: 100,
    sessions: 16,
    attended: 16,
  },
  {
    id: 'c7',
    code: 'TT0302',
    name: 'Xác suất thống kê',
    teacher: 'TS. Lý Quang Minh',
    credits: 3,
    colorIndex: 1,
    room: 'A203',
    attendance: 83,
    sessions: 24,
    attended: 20,
  },
  {
    id: 'c8',
    code: 'KT0104',
    name: 'Kinh tế vi mô 1',
    teacher: 'TS. Vũ Thị Hồng',
    credits: 3,
    colorIndex: 4,
    room: 'C102',
    attendance: 90,
    sessions: 24,
    attended: 22,
  },
];

/**
 * Weekly timetable. `day` uses ISO weekday (Mon = 2 … Sat = 7).
 * Times are "HH:MM" strings; the view converts them to grid rows.
 */
export const scheduleSessions = [
  { id: 's1', courseId: 'c1', day: 2, start: '07:00', end: '08:30', room: 'A201', type: 'LT', weekFrom: 1, weekTo: 16 },
  { id: 's2', courseId: 'c3', day: 2, start: '08:45', end: '10:15', room: 'C401', type: 'TH', weekFrom: 1, weekTo: 16 },
  { id: 's3', courseId: 'c7', day: 2, start: '13:00', end: '14:30', room: 'A203', type: 'LT', weekFrom: 1, weekTo: 16 },
  { id: 's4', courseId: 'c4', day: 3, start: '07:00', end: '08:30', room: 'A108', type: 'LT', weekFrom: 1, weekTo: 16 },
  { id: 's5', courseId: 'c2', day: 3, start: '09:00', end: '10:30', room: 'B105', type: 'LT', weekFrom: 1, weekTo: 16 },
  { id: 's6', courseId: 'c5', day: 3, start: '14:00', end: '15:30', room: 'D302', type: 'LT', weekFrom: 1, weekTo: 16 },
  { id: 's7', courseId: 'c1', day: 4, start: '07:00', end: '08:30', room: 'A201', type: 'LT', weekFrom: 1, weekTo: 16 },
  { id: 's8', courseId: 'c8', day: 4, start: '10:00', end: '11:30', room: 'C102', type: 'LT', weekFrom: 1, weekTo: 16 },
  { id: 's9', courseId: 'c3', day: 4, start: '13:00', end: '16:00', room: 'C401', type: 'TH', weekFrom: 1, weekTo: 16 },
  { id: 's10', courseId: 'c6', day: 5, start: '07:00', end: '08:30', room: 'Sân thể thao', type: 'TH', weekFrom: 1, weekTo: 16 },
  { id: 's11', courseId: 'c2', day: 5, start: '09:00', end: '10:30', room: 'B105', type: 'LT', weekFrom: 1, weekTo: 16 },
  { id: 's12', courseId: 'c5', day: 5, start: '13:00', end: '16:00', room: 'D302', type: 'TH', weekFrom: 1, weekTo: 16 },
  { id: 's13', courseId: 'c7', day: 6, start: '07:00', end: '08:30', room: 'A203', type: 'LT', weekFrom: 1, weekTo: 16 },
  { id: 's14', courseId: 'c8', day: 6, start: '09:00', end: '10:30', room: 'C102', type: 'LT', weekFrom: 1, weekTo: 16 },
];

/** Exams coming up — drives the dashboard countdown. */
export const exams = [
  { id: 'e1', courseId: 'c5', date: ahead(4, 3), room: 'D302', type: 'Kiểm tra giữa kỳ' },
  { id: 'e2', courseId: 'c1', date: ahead(11, 2), room: 'Hội trường A', type: 'Kiểm tra giữa kỳ' },
  { id: 'e3', courseId: 'c3', date: ahead(18, 1), room: 'Phòng máy C401', type: 'Thực hành' },
  { id: 'e4', courseId: 'c7', date: ahead(25, 4), room: 'A203', type: 'Kiểm tra giữa kỳ' },
];

/* -------------------------------------------------------------------------- */
/* News & announcements                                                        */
/* -------------------------------------------------------------------------- */

export const newsCategories = [
  { id: 'hoc-thi', label: 'Học & Thi', className: 'cat-hoc', icon: 'graduation' },
  { id: 'thong-bao', label: 'Thông báo', className: 'cat-thi', icon: 'megaphone' },
  { id: 'khoa', label: 'Khoa & Viện', className: 'cat-khoa', icon: 'building' },
  { id: 'su-kien', label: 'Sự kiện', className: 'cat-su', icon: 'sparkle' },
  { id: 'hoc-bong', label: 'Học bổng', className: 'cat-su', icon: 'award' },
  { id: 'hoat-dong', label: 'Hoạt động', className: 'cat-khac', icon: 'flame' },
];

export const news = [
  {
    id: 'n1',
    title: 'Lịch thi kiểm tra giữa kỳ học kỳ 2 năm học 2025-2026 chính thức',
    category: 'hoc-thi',
    excerpt:
      'Phòng Đào tạo công bố lịch thi giữa kỳ với 256 môn học. Sinh viên kiểm tra kỹ mã môn, thời gian và địa điểm thi trước khi bắt đầu.',
    content:
      'Phòng Đào tạo Trường Đại học Giao thông vận tải và Truyền thông trân trọng thông báo lịch thi kiểm tra giữa kỳ học kỳ 2, năm học 2025-2026.\n\nToàn bộ lịch thi gồm 256 môn học được bố trí từ ngày 12/11 đến ngày 24/11. Sinh viên tải lịch thi đầy đủ dưới đây và đối chiếu với đăng ký học phần của mình.\n\nLưu ý quan trọng:\n• Đến đúng giờ thi, mang đầy đủ thẻ sinh viên và giấy tờ tùy thân.\n• Sinh viên vắng mặt không có lý do chính đáng sẽ bị đánh 0 điểm.\n• Kết quả thi giữa kỳ chiếm 30% điểm môn học.\n• Sinh viên có khiếu nại về lịch thi phải nộp đơn trước 17h00 ngày 08/11 tại Phòng Đào tạo (P203).\n\nMọi thắc mắc xin liên hệ cán bộ giảng viên phụ trách môn hoặc Văn phòng Khoa.',
    author: 'Phòng Đào tạo',
    authorId: null,
    publishedAt: ago(1, 3),
    pinned: true,
    urgent: true,
    read: false,
    views: 4821,
    attachments: [
      { name: 'Lich-thi-giua-ky-HK2-2025-2026.pdf', size: 1_842_000 },
    ],
  },
  {
    id: 'n2',
    title: 'Thông báo về việc tạm dừng nhận đăng ký học phần học kỳ 3',
    category: 'thong-bao',
    excerpt:
      'Hệ thống Đào tạo sẽ tạm dừng tính năng đăng ký học phần từ 18h00 thứ Sáu tuần này để nâng cấp cơ sở dữ liệu.',
    content:
      'Nhằm nâng cấp hạ tầng hệ thống đăng ký học phần và tránh tình trạng quá tải trong giờ cao điểm, Nhà trường thông báo:\n\nThời gian tạm dừng: từ 18h00 thứ Sáu tuần này đến 08h00 thứ Hai tuần sau.\n\nTrong thời gian này, toàn bộ chức năng đăng ký, sửa, hủy học phần trên hệ thống sẽ tạm thời không khả dụng. Kết quả đăng ký đã thực hiện trước thời điểm này vẫn được giữ nguyên.\n\nSinh viên đã đăng ký học phần dự kiến trong học kỳ 3 nhưng chưa hoàn tất phải liên hệ khoa trước khi hệ thống mở lại.',
    author: 'Phòng Quản lý đào tạo',
    authorId: null,
    publishedAt: ago(2, 6),
    pinned: true,
    urgent: false,
    read: false,
    views: 3120,
    attachments: [],
  },
  {
    id: 'n3',
    title: 'Hội chợ Sinh viên khởi nghiệp quốc tế Startup Wheel 2026',
    category: 'su-kien',
    excerpt:
      'Sự kiện lớn nhất năm dành cho sinh viên khởi nghiệp với 120 gian hàng và 30 buổi pitching từ các quỹ đầu tư.',
    content:
      'Startup Wheel 2026 sẽ được tổ chức tại Trung tâm Hội nghị & Triển lãm Cầu Giấy trong 03 ngày.\n\nNội dung chính:\n• 120 gian hàng trưng bày dự án sinh viên từ 40 trường đại học.\n• 30 phiên pitching với nhà đầu tư và đơn vị doanh nghiệp.\n• Hội chợ việc làm Startup Talent với hơn 200 cơ hội.\n• Talkshow "Từ ý tưởng đến sản phẩm" cùng các founder trẻ.\n\nSinh viên UTC được miễn phí vé vào cổng khi xuất trình thẻ sinh viên. Đăng ký trước qua hệ thống UTC Student để nhận mã vé QR.\n\nHạn chót đăng ký: 25/11.',
    author: 'Đoàn Thanh niên UTC',
    authorId: null,
    publishedAt: ago(4),
    pinned: false,
    urgent: false,
    read: true,
    views: 1893,
    attachments: [],
  },
  {
    id: 'n4',
    title: 'Khoa Cơ khí công bố kết quả chọn đội tuyển sinh viên tham gại ROBOCON 2026',
    category: 'khoa',
    excerpt:
      'Cả 3 đội của Khoa Cơ khí đều vượt qua vòng loại, đặc biệt đội CK22-03 dẫn đầu khu vực miền Bắc với 3 giải.',
    content:
      'Chúc mừng đội tuyển sinh viên Khoa Cơ khí đã xuất sắc vượt qua vòng loại ROBOCON 2026.\n\nThành tích:\n• Giải Nhất khu vực miền Bắc: đội CK22-03 (đội trưởng Nguyễn Văn Hùng, Lê Minh Tuấn).\n• Giải Nhì: đội CK21-01.\n• Giải Ba: đội CK22-05.\n\nĐội CK22-03 gồm các thành viên đến từ lớp CK22-03 do Phan Minh Khoa làm đội trưởng. Các thành viên đã nâng cấp hệ thống nhận diện mục tiêu, tối ưu thuật toán điều khiển và hoàn thiện phần cơ khí trong 6 tháng.\n\nVòng chung kết sẽ diễn ra từ ngày 20/12 tại Hà Nội. Khoa tổ chức chương trình cổ vũ vào 15/12, kính mời toàn thể bạn học tham gia.',
    author: 'Khoa Cơ khí',
    authorId: null,
    publishedAt: ago(6, 2),
    pinned: false,
    urgent: false,
    read: true,
    views: 954,
    attachments: [],
  },
  {
    id: 'n5',
    title: 'Đăng ký học bổng Chiến lãnh tài năng học kỳ 2 năm học 2025-2026',
    category: 'hoc-bong',
    excerpt:
      'Tổng kinh phí 3,6 tỷ đồng cho 320 suất học bổng, điểm chuyên nghiệp tối thiểu 85 và hoạt động tình nguyện từ 40 giờ.',
    content:
      'Quỹ Chiến lãnh tài năng UTC mở cổng đăng ký học bổng học kỳ 2 với các chương trình:\n\n• Học bổng Xuất sắc học tập: 60 suất × 5.000.000đ/tháng.\n• Học bổng Khuyến khích: 120 suất × 3.000.000đ/tháng.\n• Học bổng Sáng tạo: 60 suất × 4.000.000đ/tháng.\n• Học bổng Đồng hành: 80 suất × 2.000.000đ/tháng.\n\nĐiều kiện chung:\n• Điểm trung bình học kỳ gần nhất từ 3.2 trở lên.\n• Điểm chuyên nghiệp (REN) tối thiểu 85.\n• Hoạt động tình nguyện, công tác phục vụ cộng đồng từ 40 giờ.\n\nHồ sơ nộp trực tuyến qua UTC Student, hạn chót 30/11. Kết quả công bố ngày 10/12.',
    author: 'Phòng Công tác sinh viên',
    authorId: null,
    publishedAt: ago(8),
    pinned: false,
    urgent: false,
    read: true,
    views: 2671,
    attachments: [
      { name: 'Huong-dan-ho-so-hoc-bong-CLT-2026.pdf', size: 964_000 },
    ],
  },
  {
    id: 'n6',
    title: 'Khai giảng Câu lạc bộ xe điện UTC (UTC-EV Club) — tuyển thành viên',
    category: 'hoat-dong',
    excerpt:
      'Câu lạc bộ chuyên về xe điện, mạch điện tử và năng lượng tái tạo mở cổng đăng ký thành viên đợt 2.',
    content:
      'UTC-EV Club chính thức ra mắt đợt 2 với 4 nhóm hoạt động: Chế tạo xe điện, Điện tử nguồn, Năng lượng mặt trời và Truyền thông.\n\nHoạt động gồm:\n• Chế tạo và đua xe điện mini mỗi học kỳ.\n• Workshop điện tử và lập trình vi điều khiển.\n• Tham quan nhà máy sản xuất pin và trạm sạc.\n• Tham gia giải đấu Shell Eco-marathon.\n\nKhông giới hạn chuyên ngành, mở cho cả sinh viên các khoa khác. Đăng ký tại phòng 205 tòa nhà A hoặc qua UTC Student trước 20/11.',
    author: 'CLB Xe điện UTC',
    authorId: null,
    publishedAt: ago(11),
    pinned: false,
    urgent: false,
    read: true,
    views: 723,
    attachments: [],
  },
  {
    id: 'n7',
    title: 'Cảnh báo lừa đảo giả danh giảng viên và nhân viên trường',
    category: 'thong-bao',
    excerpt:
      'Hiện có nhiều đối tượng mạo danh nhân viên nhà trường, yêu cầu chuyển tiền qua MoMo hoặc chuyển khoản ngân hàng.',
    content:
      'Đơn vị Công an TP. Hà Nội phối hợp Nhà trường cảnh báo tình trạng lừa đảo mạo danh giảng viên và nhân viên Nhà trường.\n\nCác hình thức lừa đảo phổ biến:\n• Nhắn tin mạo danh giảng viên yêu cầu nộp tiền bảo mật điểm.\n• Gọi điện giả danh công an yêu cầu chuyển khoản điều tra.\n• Gửi đường dẫn giả mạo hệ thống đăng nhập để lấy tài khoản.\n\nDấu hiệu nhận biết:\n• Giảng viên và cán bộ nhà trường KHÔNG BAO GIỜ yêu cầu chuyển tiền.\n• Số điện thoại chính thức của Nhà trường luôn có mã vùng 024 hoặc 1900.\n\nNgười bị lừa cần báo ngay cho Công an 110 hoặc Phòng An ninh mạng. Mọi nghi vấn vui lòng gửi về email an ninh@utc.edu.vn.',
    author: 'Phòng An ninh mạng',
    authorId: null,
    publishedAt: ago(14),
    pinned: false,
    urgent: true,
    read: true,
    views: 5410,
    attachments: [],
  },
  {
    id: 'n8',
    title: 'Thư viện mở rộng giờ mở cửa và bổ sung góc học nhóm',
    category: 'khoa',
    excerpt:
      'Thư viện Trường mở cửa đến 22h tất cả các ngày trong tuần, phục vụ 40 chỗ học nhóm mới tại khu đọc tầng 3.',
    content:
      'Phòng Thư viện - Trung tâm học liệu thông báo thay đổi giờ mở cửa từ 05/11:\n\n• Thứ Hai - Thứ Sáu: 07h00 - 22h00.\n• Thứ Bảy: 08h00 - 17h00.\n• Chủ Nhật: 08h00 - 17h00.\n\nSong song, thư viện bổ sung 40 chỗ học nhóm có vách âm thanh, ổ cắm và màn hình trình chiếu tại khu đọc tầng 3. Các chỗ này được đặt trước trực tuyến qua hệ thống thư viện, tối đa 4 giờ/lần.',
    author: 'Trung tâm học liệu',
    authorId: null,
    publishedAt: ago(17),
    pinned: false,
    urgent: false,
    read: true,
    views: 1440,
    attachments: [],
  },
];

/** Upcoming events shown in the news rail. */
export const events = [
  { id: 'ev1', title: 'Khai giảng Câu lạc bộ Xe điện UTC', date: ahead(2), location: 'Phòng 205, Tòa nhà A', type: 'CLB' },
  { id: 'ev2', title: 'Kiểm tra giữa kỳ Mạch điện tử 1', date: ahead(4, 3), location: 'Phòng D302', type: 'Thi' },
  { id: 'ev3', title: 'Hội thảo khởi nghiệp sinh viên', date: ahead(7), location: 'Hội trường A', type: 'Sự kiện' },
  { id: 'ev4', title: 'Bảo vệ đồ án tốt nghiệp đợt 1', date: ahead(12), location: 'Hội trường B', type: 'Học thuật' },
  { id: 'ev5', title: 'Ngày hội hướng nghiệm và việc làm', date: ahead(19), location: 'Sân trường', type: 'Sự kiện' },
];

/* -------------------------------------------------------------------------- */
/* Posts & comments                                                            */
/* -------------------------------------------------------------------------- */

export const posts = [
  {
    id: 'p1',
    authorId: 'u8',
    createdAt: ago(0, 5),
    content:
      'Ai đang học môn TN0101 của giáo viên Tuấn vậy? Thầy vừa báo đồ án cuối kỳ sẽ dùng đề tài mở, ai có ý tưởng hay thì cùng góp nhé. Nhóm mình đang phân vân giữa làm game 2D hay phần mềm quản lý thư viện.',
    likes: 24,
    dislikes: 1,
    likedBy: ['u4', 'u9'],
    dislikedBy: [],
    comments: [
      { id: 'c1', authorId: 'u4', text: 'Bọn mình đang làm quản lý thư viện, nghe nhóm bạn sẽ cần database hơn là ván 3D nên lời khuyên nên đi vào đó 😄', createdAt: ago(0, 4) },
      { id: 'c2', authorId: 'u9', text: 'Quản lý thư viện làm dễ chấm điểm vì có đủ CRUD, phân quyền, báo cáo. Có thể làm thêm phần mượn sách + quét mã vạch luôn.', createdAt: ago(0, 3) },
      { id: 'c3', authorId: 'u2', text: 'Game 2D vẫn làm được nhưng đừng chọn 3D nếu thời gian có hạn, mất cả tháng còn không xong.', createdAt: ago(0, 1) },
    ],
  },
  {
    id: 'p2',
    authorId: 'u3',
    createdAt: ago(1, 4),
    content:
      'Cuối cùng cũng chạy được mạch điều khiển tốc độ động cơ DC của nhóm! Vòng lặp PID đạt độ ổn định sau khoảng 400ms, sai số dưới 2%. Cảm ơn anh Long trong nhóm bên đã cho mượn cảm biến encoder nhé 🙏',
    likes: 87,
    dislikes: 2,
    likedBy: ['u1', 'u4', 'u8'],
    dislikedBy: [],
    comments: [
      { id: 'c4', authorId: 'u1', text: 'Chúc mừng bạn! Nhóm mình đang làm phần cơ khí, cần ai đo tốc độ motor giúp thì inbox mình nhé.', createdAt: ago(1, 2) },
      { id: 'c5', authorId: 'u8', text: 'Đẹp quá, có thể share source không?', createdAt: ago(0, 20) },
    ],
  },
  {
    id: 'p3',
    authorId: 'u10',
    createdAt: ago(2, 6),
    content:
      'Tổng hợp 500 từ vựng IELTS chuyên ngành Giao thông vận tải + bài tập nghe ngắn có phụ đề. Tải hoàn toàn miễn phí trong mục Tài liệu, môn ANH0103 nhé các bạn!',
    likes: 156,
    dislikes: 0,
    likedBy: ['u1', 'u2', 'u3', 'u4'],
    dislikedBy: [],
    comments: [
      { id: 'c6', authorId: 'u6', text: 'Cảm ơn chị nhiều, tài liệu rất chi tiết!', createdAt: ago(2, 3) },
      { id: 'c7', authorId: 'u9', text: 'Cho mình xin file Excel đi chị, đang luyện đề tháng 12.', createdAt: ago(1, 22) },
    ],
  },
  {
    id: 'p4',
    authorId: 'u5',
    createdAt: ago(3, 2),
    content:
      'Nhắc nhỏ: phòng thí nghiệm CNC tòa C đã mở lại sau kỳ bảo trì, có 2 máy phay đang hoạt động. Ai cần thực hành gia công thì đặt lịch trước qua phòng thí nghiệm nhé, mỗi buổi tối đa 4 người.',
    likes: 41,
    dislikes: 3,
    likedBy: ['u2', 'u8'],
    dislikedBy: [],
    comments: [
      { id: 'c8', authorId: 'u2', text: 'Đặt lịch theo hình thức nào ạ? Qua thư ký khoa hay form online?', createdAt: ago(3, 1) },
      { id: 'c9', authorId: 'u5', text: 'Gửi email cho thầy Tuấn kèm thông tin mã SV và khung giờ mong muốn, thầy sẽ xếp lịch trong 1 ngày.', createdAt: ago(2, 23) },
    ],
  },
  {
    id: 'p5',
    authorId: 'u7',
    createdAt: ago(4, 8),
    content:
      'Bài tập lớn môn Quản lý giao thông vận tải dùng VISSIM 2024, bản mới có lỗi khi mô phỏng giao lộ 5 làn. Mình sửa bằng cách hạ bước mô phỏng xuống 5 step/s thì chạy ổn. Nếu ai gặp lỗi giống mình thì áp dụng nhé.',
    likes: 33,
    dislikes: 0,
    likedBy: ['u9'],
    dislikedBy: [],
    comments: [
      { id: 'c10', authorId: 'u6', text: 'Cảm ơn anh, bọn em cũng bị lỗi này mãi không hiểu sao.', createdAt: ago(4, 2) },
    ],
  },
  {
    id: 'p6',
    authorId: 'u6',
    createdAt: ago(6, 5),
    content:
      'Team marketing của CLB Khởi nghiệp cần thêm bạn thiết kế lại landing page cho sự kiện Startup Wheel. Công việc linh hoạt, có thể làm từ xa, mỗi buổi họp 1 tiếng. Inbox cho mình nếu quan tâm nha!',
    likes: 19,
    dislikes: 1,
    likedBy: ['u4'],
    dislikedBy: [],
    comments: [
      { id: 'c11', authorId: 'u4', text: 'Mình muốn nhận việc, có kinh nghiệm React/Tailwind nhé. Gửi mình JD chi tiết hơn được không?', createdAt: ago(5, 22) },
      { id: 'c12', authorId: 'u6', text: 'Chào bạn, mình gửi bạn JD qua tin nhắn nha. Cảm ơn bạn nhiều!', createdAt: ago(5, 20) },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

export const documents = [
  {
    id: 'f1',
    courseId: 'c1',
    title: 'Bài giảng Toán giải tích 1 — Học kỳ 2 (PDF đầy đủ)',
    description:
      'Tập bài giảng gồm toàn bộ 8 chương, kèm bài tập về nhà và đáp án chi tiết cho từng tuần.',
    fileName: 'Toan-giai-tich-1-HK2.pdf',
    fileSize: 8_420_000,
    mimeType: 'application/pdf',
    authorId: 'u2',
    createdAt: ago(0, 20),
    downloads: 312,
    likes: 89,
    likedBy: ['u1', 'u4'],
    semester: 'HK2-2025',
    tags: ['toán cao cấp', 'giảng bài', 'ôn thi'],
  },
  {
    id: 'f2',
    courseId: 'c3',
    title: 'Đồ án cuối môn Lập trình C — Đề bài & hướng dẫn chấm',
    description: 'Đề bài mẫu 5 đề tài mở kèm bảng tiêu chí chấm điểm chi tiết từ thầy Tuấn.',
    fileName: 'De-tai-do-an-LTC.pdf',
    fileSize: 2_180_000,
    mimeType: 'application/pdf',
    authorId: 'u8',
    createdAt: ago(1, 5),
    downloads: 148,
    likes: 42,
    likedBy: ['u4'],
    semester: 'HK2-2025',
    tags: ['lập trình C', 'đồ án'],
  },
  {
    id: 'f3',
    courseId: 'c2',
    title: 'Tóm tắt Vật lý đại cương — Công thức & bảng tra nhanh',
    description: 'Toàn bộ công thức của 12 chương rút gọn trong 8 trang, có thể in ra mang theo khi làm bài thi.',
    fileName: 'Cong-thuc-Vat-ly-dai-cuong.xlsx',
    fileSize: 1_240_000,
    mimeType: 'application/vnd.ms-excel',
    authorId: 'u10',
    createdAt: ago(2, 3),
    downloads: 267,
    likes: 134,
    likedBy: ['u1', 'u3', 'u9'],
    semester: 'HK2-2025',
    tags: ['vật lý', 'công thức', 'tóm tắt'],
  },
  {
    id: 'f4',
    courseId: 'c5',
    title: 'Slide Mạch điện tử 1 — Transistor, Op-amp, tầng khuếch đại',
    description: 'Slide trình chiếu gồm 42 slide với sơ đồ mạch được vẽ rõ và ví dụ tính toán.',
    fileName: 'Mach-dien-tu-1-Slide.pptx',
    fileSize: 14_600_000,
    mimeType: 'application/vnd.ms-powerpoint',
    authorId: 'u3',
    createdAt: ago(3, 8),
    downloads: 96,
    likes: 57,
    likedBy: ['u1'],
    semester: 'HK2-2025',
    tags: ['điện tử', 'slide', 'op-amp'],
  },
  {
    id: 'f5',
    courseId: 'c7',
    title: 'Đề thi giữa kỳ Xác suất thống kê 2023-2025 (có lời giải)',
    description: 'Gom 3 kỳ thi, phân loại theo dạng bài để dễ ôn nhanh trước kỳ thi giữa kỳ.',
    fileName: 'De-thi-Xac-suat-Thong-ke-2023-2025.zip',
    fileSize: 6_780_000,
    mimeType: 'application/zip',
    authorId: 'u9',
    createdAt: ago(5, 1),
    downloads: 421,
    likes: 203,
    likedBy: ['u1', 'u2', 'u4', 'u7'],
    semester: 'HK2-2025',
    tags: ['xác suất', 'thống kê', 'đề thi'],
  },
  {
    id: 'f6',
    courseId: 'c4',
    title: 'Ghi chú triết học Mác - Lênin chuyên đề 5-6',
    description: 'Tóm tắt kiến thức trọng tâm chuyên đề 5 và 6, kèm sơ đồ phân tích các mối quan hệ.',
    fileName: 'Ghi-chu-Triet-hoc-Chuyen-de-5-6.docx',
    fileSize: 1_960_000,
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    authorId: 'u6',
    createdAt: ago(6, 4),
    downloads: 88,
    likes: 21,
    likedBy: [],
    semester: 'HK2-2025',
    tags: ['triết học', 'tóm tắt'],
  },
  {
    id: 'f7',
    courseId: 'c8',
    title: 'Bộ case study kinh tế vi mô (Microsoft, VinFast, Vinamilk)',
    description: 'Mỗi case có kèm câu hỏi phân tích và slide thuyết trình mẫu của nhóm đạt điểm 9.',
    fileName: 'Case-study-Kinh-te-vi-micro.pptx',
    fileSize: 9_120_000,
    mimeType: 'application/vnd.ms-powerpoint',
    authorId: 'u6',
    createdAt: ago(7, 6),
    downloads: 174,
    likes: 65,
    likedBy: ['u4'],
    semester: 'HK2-2025',
    tags: ['kinh tế', 'case study'],
  },
  {
    id: 'f8',
    courseId: 'c3',
    title: 'Bài tập Lập trình C — 200 bài tập có lời giải (PDF)',
    description: 'Từ bài cơ bản đến cấu trúc dữ liệu, mỗi bài có lời giải chi tiết và gợi ý.',
    fileName: '200-bai-tap-Lap-trinh-C.pdf',
    fileSize: 5_340_000,
    mimeType: 'application/pdf',
    authorId: 'u4',
    createdAt: ago(9, 2),
    downloads: 508,
    likes: 276,
    likedBy: ['u1', 'u2', 'u3', 'u8'],
    semester: 'HK2-2025',
    tags: ['lập trình C', 'bài tập'],
  },
  {
    id: 'f9',
    courseId: 'c1',
    title: 'Bảng tích phân tích giới hạn (Laplace) — tra cứu nhanh',
    description: 'Bảng các trường hợp giới hạn thường gặp kèm ví dụ áp dụng từng bước.',
    fileName: 'Bang-tich-phan-Laplace.xlsx',
    fileSize: 860_000,
    mimeType: 'application/vnd.ms-excel',
    authorId: 'u5',
    createdAt: ago(11, 4),
    downloads: 133,
    likes: 44,
    likedBy: ['u2'],
    semester: 'HK2-2025',
    tags: ['toán cao cấp', 'tích phân'],
  },
  {
    id: 'f10',
    courseId: 'c2',
    title: 'Lab Vật lý đại cương — Hướng dẫn 10 bài thí nghiệm',
    description: 'Hướng dẫn chi tiết quy trình đo, xử lý số liệu và báo cáo mẫu đạt điểm tuyệt đối.',
    fileName: 'Huong-dan-thi-nghiem-Vat-ly.pdf',
    fileSize: 11_280_000,
    mimeType: 'application/pdf',
    authorId: 'u10',
    createdAt: ago(13, 1),
    downloads: 219,
    likes: 112,
    likedBy: ['u1', 'u3'],
    semester: 'HK2-2025',
    tags: ['vật lý', 'thí nghiệm', 'labo'],
  },
  {
    id: 'f11',
    courseId: 'c5',
    title: 'Mạch nguồn năng lượng mặt trời 5V — schematic + PCB',
    description: 'File thiết kế mạch in và mã nguồn điều khiển MPPT cho dự án mô hình năng lượng.',
    fileName: 'Solar-MPPT-Schematic.zip',
    fileSize: 18_900_000,
    mimeType: 'application/zip',
    authorId: 'u3',
    createdAt: ago(15, 3),
    downloads: 74,
    likes: 39,
    likedBy: ['u1'],
    semester: 'HK2-2025',
    tags: ['điện tử', 'năng lượng mặt trời', 'PCB'],
  },
  {
    id: 'f12',
    courseId: 'c6',
    title: 'Kế hoạch luyện tập thể dục cho sinh viên làm việc văn phòng',
    description: 'Bài tập 12 tuần, không cần dụng cụ, mỗi ngày chỉ 20 phút.',
    fileName: 'Ke-hoach-tap-GDTC.pdf',
    fileSize: 3_450_000,
    mimeType: 'application/pdf',
    authorId: 'u8',
    createdAt: ago(18),
    downloads: 156,
    likes: 72,
    likedBy: ['u6'],
    semester: 'HK2-2025',
    tags: ['thể chất', 'sức khỏe'],
  },
];

/* -------------------------------------------------------------------------- */
/* Friendships                                                                 */
/* -------------------------------------------------------------------------- */

/** Directed friend edges: `from` requested `to`. Status: pending | accepted. */
export const friendships = [
  { id: 'fr1', from: 'u2', to: 'u1', status: 'accepted', createdAt: ago(30) },
  { id: 'fr2', from: 'u3', to: 'u1', status: 'accepted', createdAt: ago(28) },
  { id: 'fr3', from: 'u8', to: 'u1', status: 'accepted', createdAt: ago(40) },
  { id: 'fr4', from: 'u4', to: 'u1', status: 'pending', createdAt: ago(1, 5) },
  { id: 'fr5', from: 'u1', to: 'u6', status: 'pending', createdAt: ago(2, 3) },
  { id: 'fr6', from: 'u9', to: 'u1', status: 'pending', createdAt: ago(0, 9) },
  { id: 'fr7', from: 'u5', to: 'u8', status: 'accepted', createdAt: ago(25) },
  { id: 'fr8', from: 'u10', to: 'u8', status: 'accepted', createdAt: ago(22) },
];

/* -------------------------------------------------------------------------- */
/* Conversations                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Conversations. `type` is `direct` or `group`.
 * Messages carry `attachments: []` — see chat/attachmentRegistry.js for kinds.
 */
export const conversations = [
  {
    id: 'cv1',
    type: 'direct',
    title: 'Trần Quốc Bảo',
    memberIds: ['u1', 'u2'],
    createdAt: ago(30),
    messages: [
      { id: 'm1', senderId: 'u2', text: 'Ê, tài liệu Toán giải tích học kỳ này bạn tải được chưa?', createdAt: ago(1, 4), status: 'read', attachments: [] },
      { id: 'm2', senderId: 'u1', text: 'Tải rồi, cảm ơn bạn. Trông đầy đủ quá luôn.', createdAt: ago(1, 4), status: 'read', attachments: [] },
      { id: 'm3', senderId: 'u2', text: 'Tuyệt 👍 Tuần sau thi giữa kỳ, nếu cần ôn chung thì mình lập nhóm nhé.', createdAt: ago(1, 3), status: 'read', attachments: [] },
      { id: 'm4', senderId: 'u1', text: 'Được luôn, mình tham gia. Chiều nay gọi được không bạn?', createdAt: ago(1, 2), status: 'read', attachments: [] },
      { id: 'm5', senderId: 'u2', text: 'Được, 5h nhé. Mình gửi link phòng học sau.', createdAt: ago(0, 6), status: 'read', attachments: [] },
      { id: 'm6', senderId: 'u1', text: 'Ok bạn! Mà nhớ mang đồ án môn Lập trình C đi xem ý tưởng của bạn nhé 😄', createdAt: ago(0, 2), status: 'delivered', attachments: [] },
    ],
  },
  {
    id: 'cv2',
    type: 'direct',
    title: 'Lê Hoàng Long',
    memberIds: ['u1', 'u3'],
    createdAt: ago(20),
    messages: [
      { id: 'm10', senderId: 'u3', text: 'Chào bạn, mình thấy bạn học khoa Cơ khí đúng không? Nhóm mình đang cần ai rành CAD để hỗ trợ mô hình.', createdAt: ago(2, 6), status: 'read', attachments: [] },
      { id: 'm11', senderId: 'u1', text: 'Chào bạn, đúng là mình học Cơ khi. CAD thì mình dùng SolidWorks và AutoCAD, để mình xem bài toán của nhóm bạn đã.', createdAt: ago(2, 4), status: 'read', attachments: [] },
      { id: 'm12', senderId: 'u3', text: 'Cảm ơn bạn nhé, mình gửi file mô hình tối mai nhé!', createdAt: ago(2, 2), status: 'read', attachments: [] },
      { id: 'm13', senderId: 'u3', text: 'À bạn ơi, khi nào rảnh mình hỏi chuyện linh kiện in 3D không?', createdAt: ago(0, 8), status: 'delivered', attachments: [] },
    ],
  },
  {
    id: 'cv3',
    type: 'group',
    title: 'Nhóm Đồ án CK22-03',
    memberIds: ['u1', 'u8', 'u2', 'u5'],
    createdAt: ago(35),
    messages: [
      { id: 'm20', senderId: 'u8', text: 'Chào mọi người! Mình tạo nhóm để trao đổi về đồ án cuối kỳ nhé. Ai có gì thì cứ nhắn vào đây.', createdAt: ago(6, 4), status: 'read', attachments: [] },
      { id: 'm21', senderId: 'u2', text: 'Nhận thông báo rồi. Đồ án năm nay thầy Tuấn chấp nhận đề tài về tối ưu năng lượng đúng không ạ?', createdAt: ago(6, 3), status: 'read', attachments: [] },
      { id: 'm22', senderId: 'u8', text: 'Đúng rồi, nhưng mỗi nhóm 3 người. Anh Tuấn khuyên chọn đề tài thực tế, có dữ liệu thật.', createdAt: ago(6, 2), status: 'read', attachments: [] },
      { id: 'm23', senderId: 'u5', text: 'Bọn mình có máy phay CNC ở Hà Nội, nếu cần gia công mẫu thì mình lo được.', createdAt: ago(2, 5), status: 'read', attachments: [] },
      { id: 'm24', senderId: 'u1', text: 'Tuyệt vời! Vậy mình lo phần thiết kế CAD, cảm ơn bạn.', createdAt: ago(2, 3), status: 'read', attachments: [] },
      { id: 'm25', senderId: 'u8', type: 'system', text: 'Phan Minh Khoa đã đổi tên nhóm thành "Nhóm Đồ án CK22-03"', createdAt: ago(1, 6), status: 'read', attachments: [] },
      { id: 'm26', senderId: 'u8', text: 'Chiều nay 14h họp phòng 205 nha mọi người, mang bản vẽ ban đầu nhé.', createdAt: ago(0, 10), status: 'delivered', attachments: [] },
      { id: 'm27', senderId: 'u5', text: 'Nhận rồi ạ!', createdAt: ago(0, 7), status: 'delivered', attachments: [] },
    ],
  },
  {
    id: 'cv4',
    type: 'direct',
    title: 'Phạm Thu Trang',
    memberIds: ['u1', 'u4'],
    createdAt: ago(4),
    messages: [
      { id: 'm30', senderId: 'u4', text: 'Chào Mai Anh, mình thấy bạn đăng bài về tìm nhóm CAD. Bọn mình cũng đang cần người hỗ trợ mô hình 3D.', createdAt: ago(1, 1), status: 'read', attachments: [] },
      { id: 'm31', senderId: 'u1', text: 'Chào bạn! Bạn học khoa nào vậy? Mô hình gì cụ thể ạ?', createdAt: ago(0, 14), status: 'delivered', attachments: [] },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

export const notifications = [
  { id: 'nt1', category: 'grade', title: 'Cập nhật điểm môn Lập trình C', message: 'Điểm đồ án cuối kỳ: 8.5/10. Bạn có thể xem điểm chi tiết trong mục Kết quả học tập.', createdAt: ago(0, 3), read: false, route: '/schedule' },
  { id: 'nt2', category: 'news', title: 'Thông báo mới từ Phòng Đào tạo', message: 'Lịch thi giữa kỳ học kỳ 2 đã được công bố chính thức.', createdAt: ago(1, 2), read: false, route: '/news/n1' },
  { id: 'nt3', category: 'chat', title: 'Tin nhắn mới trong "Nhóm Đồ án CK22-03"', message: 'Phan Minh Khoa: Chiều nay 14h họp phòng 205 nha mọi người...', createdAt: ago(0, 1), read: false, route: '/chat/cv3' },
  { id: 'nt4', category: 'friend', title: 'Lời mời kết bạn mới', message: 'Đỗ Ngọc Hân (2251010863) muốn kết bạn với bạn.', createdAt: ago(0, 5), read: false, route: '/friends' },
  { id: 'nt5', category: 'doc', title: 'Tài liệu bạn tải xuống được cập nhật', message: '"Bảng tích phân tích giới hạn (Laplace)" vừa được bổ sung bảng tra cứu mới.', createdAt: ago(2), read: true, route: '/documents' },
  { id: 'nt6', category: 'friend', title: 'Trần Quốc Bảo chấp nhận lời kết bạn', message: 'Bạn đã kết nối thành công.', createdAt: ago(3), read: true, route: '/friends' },
  { id: 'nt7', category: 'alert', title: 'Nhắc nhở: sắp đến hạn đăng ký học phần', message: 'Hạn chót đăng ký học phần học kỳ 3 là 23h59 ngày 20/11.', createdAt: ago(4), read: true, route: '/schedule' },
  { id: 'nt8', category: 'news', title: 'Khoa Cơ khí công bố kết quả ROBOCON 2026', message: 'Đội CK22-03 đạt Giải Nhất khu vực miền Bắc.', createdAt: ago(6), read: true, route: '/news/n4' },
];

/* -------------------------------------------------------------------------- */
/* Current term configuration                                                   */
/* -------------------------------------------------------------------------- */

export const termConfig = {
  name: 'Học kỳ 2 năm học 2025-2026',
  currentWeek: 12,
  totalWeeks: 16,
  startDate: new Date(now - 11 * 7 * DAY),
  dayNames: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'],
};

/* -------------------------------------------------------------------------- */
/* Academic results                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Grading scale and per-course scores.
 *
 * `components` are the individual assessments that roll up into the course
 * grade. `weight` is the share of the final mark, and the weighted mean of
 * `score` is what `final` reports — the page recomputes it at render time so
 * the table can never disagree with the breakdown shown underneath.
 *
 *   final = Σ (score × weight)
 *
 * Grades are still provisional for any course whose `status` is not
 * 'final' — mid-term coursework is complete but the final exam has not been
 * marked. The UI labels those explicitly rather than implying a final result.
 */
export const gradeScale = [
  { min: 9.0, letter: 'A', grade: 'Xuất sắc', gradePoint: 4.0, color: 'success' },
  { min: 8.0, letter: 'A-', grade: 'Giỏi', gradePoint: 3.5, color: 'success' },
  { min: 7.0, letter: 'B+', grade: 'Khá', gradePoint: 3.0, color: 'primary' },
  { min: 6.5, letter: 'B', grade: 'Khá', gradePoint: 2.5, color: 'primary' },
  { min: 6.0, letter: 'C+', grade: 'Trung bình khá', gradePoint: 2.0, color: 'info' },
  { min: 5.5, letter: 'C', grade: 'Trung bình', gradePoint: 1.5, color: 'info' },
  { min: 5.0, letter: 'D+', grade: 'Trung bình yếu', gradePoint: 1.0, color: 'warning' },
  { min: 4.0, letter: 'D', grade: 'Yếu', gradePoint: 0.5, color: 'warning' },
  { min: 0.0, letter: 'F', grade: 'Không đạt', gradePoint: 0.0, color: 'danger' },
];

export const grades = [
  {
    id: 'g1',
    courseId: 'c1',
    status: 'final',
    components: [
      { name: 'Điểm quá trình', score: 9.2, weight: 0.4 },
      { name: 'Giữa kỳ', score: 8.4, weight: 0.2 },
      { name: 'Cuối kỳ', score: 8.6, weight: 0.4 },
    ],
    updatedAt: new Date(now - 6 * DAY),
  },
  {
    id: 'g2',
    courseId: 'c2',
    status: 'final',
    components: [
      { name: 'Điểm quá trình', score: 8.6, weight: 0.4 },
      { name: 'Giữa kỳ', score: 8.1, weight: 0.2 },
      { name: 'Cuối kỳ', score: 8.3, weight: 0.4 },
    ],
    updatedAt: new Date(now - 6 * DAY),
  },
  {
    id: 'g3',
    courseId: 'c3',
    status: 'final',
    components: [
      { name: 'Đồ án giữa kỳ', score: 9.5, weight: 0.3 },
      { name: 'Đồ án cuối kỳ', score: 9.4, weight: 0.4 },
      { name: 'Thực hành', score: 8.8, weight: 0.3 },
    ],
    updatedAt: new Date(now - 2 * DAY),
  },
  {
    id: 'g4',
    courseId: 'c4',
    status: 'final',
    components: [
      { name: 'Điểm quá trình', score: 8.2, weight: 0.5 },
      { name: 'Cuối kỳ', score: 7.4, weight: 0.5 },
    ],
    updatedAt: new Date(now - 6 * DAY),
  },
  {
    id: 'g5',
    courseId: 'c5',
    status: 'provisional',
    components: [
      { name: 'Điểm quá trình', score: 8.4, weight: 0.4 },
      { name: 'Giữa kỳ', score: 8.8, weight: 0.2 },
      { name: 'Cuối kỳ', score: null, weight: 0.4 },
    ],
    updatedAt: new Date(now - 40 * DAY),
  },
  {
    id: 'g6',
    courseId: 'c6',
    status: 'final',
    components: [
      { name: 'Đánh giá thường xuyên', score: 10, weight: 0.5 },
      { name: 'Kiểm tra thực hành', score: 9.5, weight: 0.5 },
    ],
    updatedAt: new Date(now - 20 * DAY),
  },
  {
    id: 'g7',
    courseId: 'c7',
    status: 'final',
    components: [
      { name: 'Điểm quá trình', score: 7.9, weight: 0.4 },
      { name: 'Giữa kỳ', score: 8.2, weight: 0.2 },
      { name: 'Cuối kỳ', score: 8.0, weight: 0.4 },
    ],
    updatedAt: new Date(now - 6 * DAY),
  },
  {
    id: 'g8',
    courseId: 'c8',
    status: 'provisional',
    components: [
      { name: 'Điểm quá trình', score: 7.4, weight: 0.5 },
      { name: 'Cuối kỳ', score: null, weight: 0.5 },
    ],
    updatedAt: new Date(now - 40 * DAY),
  },
];

/** Past terms, for the GPA-by-term breakdown. */
export const gradeHistory = [
  { term: 'Học kỳ 1 · 2024-2025', gpa: 3.62, credits: 18, standing: 'Khá' },
  { term: 'Học kỳ 2 · 2024-2025', gpa: 3.71, credits: 19, standing: 'Khá' },
  { term: 'Học kỳ 1 · 2025-2026', gpa: 3.84, credits: 20, standing: 'Giỏi' },
];