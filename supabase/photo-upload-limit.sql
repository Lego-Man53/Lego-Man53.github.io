-- Apply to an existing project to allow photo originals up to 30 MB.
-- Updates only the size limit; gallery records and permissions are unchanged.
update storage.buckets set file_size_limit = 31457280 where id = 'photos';
select id, file_size_limit from storage.buckets where id = 'photos';
