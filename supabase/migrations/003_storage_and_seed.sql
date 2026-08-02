-- Private assignment file storage and initial catalog.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('assignment-files','assignment-files',false,10485760,array['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy assignment_files_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = public.current_student_id()::text
);

create policy assignment_files_select on storage.objects
for select to authenticated
using (
  bucket_id = 'assignment-files'
  and (
    (storage.foldername(name))[1] = public.current_student_id()::text
    or public.is_academic_manager()
    or (public.current_role() = 'teacher' and public.teacher_can_view_student(((storage.foldername(name))[1])::uuid))
  )
);

create policy assignment_files_update on storage.objects
for update to authenticated
using (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = public.current_student_id()::text)
with check (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = public.current_student_id()::text);

create policy assignment_files_delete on storage.objects
for delete to authenticated
using (bucket_id = 'assignment-files' and public.is_admin());

insert into public.programs(code,name,category) values
('IELTS','IELTS Academic','IELTS'),
('COMM','English Communication','Communication'),
('B2B','Corporate English','B2B')
on conflict(code) do nothing;

insert into public.levels(program_id,code,name,sequence_no)
select p.id, x.code, x.name, x.seq
from public.programs p
join (values
  ('IELTS','FOUND','Foundation',1),('IELTS','IELTS4','IELTS 4.0',2),('IELTS','IELTS5','IELTS 5.0',3),('IELTS','IELTS6','IELTS 6.0+',4),
  ('COMM','BEG','Beginner',1),('COMM','ELE','Elementary',2),('COMM','INT','Intermediate',3),
  ('B2B','B2B1','Business Foundation',1),('B2B','B2B2','Business Intermediate',2)
) as x(program_code,code,name,seq) on x.program_code = p.code
on conflict(program_id,code) do nothing;

insert into public.observation_templates(name,description)
values('ZE Standard Teaching Observation','Rubric chuẩn dùng cho scheduled, random và follow-up observation.')
on conflict(name) do nothing;

insert into public.observation_criteria(template_id,code,label,description,max_score,weight,sort_order)
select t.id, x.code, x.label, x.description, 5, 1, x.sort_order
from public.observation_templates t
join (values
 ('PREP','Lesson preparation','Kế hoạch bài dạy, tài liệu và readiness',1),
 ('OBJ','Learning objectives','Mục tiêu rõ ràng và được kiểm tra',2),
 ('ENG','Student engagement','Mức độ tham gia và tương tác của học viên',3),
 ('CLR','Instruction clarity','Hướng dẫn, modelling và concept checking',4),
 ('ERR','Error correction','Phản hồi và sửa lỗi phù hợp',5),
 ('TIME','Time management','Phân bổ thời gian và pacing',6),
 ('AFL','Assessment for learning','Kiểm tra hiểu bài và điều chỉnh dạy học',7),
 ('PRO','Professional conduct','Tác phong và trách nhiệm nghề nghiệp',8)
) as x(code,label,description,sort_order) on true
where t.name = 'ZE Standard Teaching Observation'
on conflict(template_id,code) do nothing;
