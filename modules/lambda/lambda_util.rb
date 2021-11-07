#!/usr/bin/env ruby
require 'yaml'
require 'json'

def r(cmd)
    puts "$ #{cmd}"
    `#{cmd}`
end


$so_far = [$0]
def get_arg(name)
    if ARGV.count < 1
        puts "Usage: #{$so_far.join(" ")} #{name}"
        exit 64
    end
    argument = ARGV.shift
    $so_far << argument
    argument
end

<<-HEREDOC
Usage:

update_env_vars <environment_variables yaml file> [optional list of function folders, default: all except DEFAULT_IGNORING] 
HEREDOC
yaml_file = get_arg "<yaml_file>"

env_yaml = File.read(yaml_file)
env = YAML.load(env_yaml)
env_aws = { "Variables" => env }
env_aws_json = JSON.dump(env_aws)

functions = ["CloudVTask"]

puts "Starting…"
for i in 0...functions.count
    print "Updating lambda #{i + 1}/#{functions.count}…\t\t\t\r"
    name = functions[i]
    op = r "AWS_PAGER="" aws lambda update-function-configuration --function-name #{name} --environment '#{env_aws_json}' 2>&1"
    if $?.exitstatus != 0 and not op.include?("ResourceNotFoundException")
        puts "Updating #{name} failed…"
        puts "> #{op}"
        exit $?.exitstatus
    end
end
puts "\nDone."