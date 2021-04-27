#!/usr/bin/env ruby

# Requires 'os' gem

# About lambdas:

# All lambdas are in the directory modules/lambda.
#
# Any subdirectories with a meta.yaml file are considered a lambda module.
# Lambda modules have a "function" subdirectory.
#
# This function subdirectory has symlinks to modules/lambda/lib and
# modules/lambda/bin.

require 'yaml'
require 'json'
require 'os'

LAMBDA_DIR = "modules/lambda"
LAMBDA_RUNTIME = "nodejs12.x"
DEFAULT_IGNORING = ["sw-arm", "sw-riscv", "bitstream", "test"]

def r(cmd)
    puts "$ #{cmd}"
    `#{cmd}`
end

def get_functions()
    functions_raw = Dir["#{LAMBDA_DIR}/*/meta.yaml"].map { |f| File.dirname(f) }.sort
    functions_basenames = functions_raw.map { |el| File.basename(el) }
    functions = []
    if ARGV.count == 0
        functions = functions_raw.select { |el| not DEFAULT_IGNORING.include?(File.basename(el)) }
    else
        unknown_components = (ARGV - functions_basenames)
        if not unknown_components.empty?
            puts "Unknown component(s) { #{unknown_components.join(", ")} }."
            exit 64
        end
        functions = functions_raw.select { |el| ARGV.include?(File.basename(el)) }
    end 
    functions    
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

cmd = get_arg "<command>"

case cmd
when "update_env_vars"
    <<-HEREDOC
    Usage:

    update_env_vars <environment_variables yaml file> [optional list of function folders, default: all except DEFAULT_IGNORING] 
    HEREDOC
    yaml_file = get_arg "<yaml_file>"

    env_yaml = File.read(yaml_file)
    env = YAML.load(env_yaml)
    env_aws = { "Variables" => env }
    env_aws_json = JSON.dump(env_aws)

    functions = get_functions()

    puts "Starting…"
    for i in 0...functions.count
        print "Updating lambda #{i + 1}/#{functions.count}…\t\t\t\r"
        function = functions[i]
        meta = YAML.load(File.read("#{function}/meta.yaml"))
        name = meta["name"]
        op = r "AWS_PAGER="" aws lambda update-function-configuration --runtime  --function-name #{name} --environment '#{env_aws_json}' 2>&1"
        if $?.exitstatus != 0 and not op.include?("ResourceNotFoundException")
            puts "Updating #{name} failed…"
            puts "> #{op}"
            exit $?.exitstatus
        end
    end
when "update_entries"
    <<-HEREDOC
    Usage:

    update_entries  [optional list of function folders, default: all except DEFAULT_IGNORING]

    This command packages the lambda function and uploads the payload to AWS.

    Subdirectories of /modules/lambda/bin are further filtered based on requested binaries in meta.yaml.
    This keeps deployment package sizes under control.
    HEREDOC
    if not OS.linux?
        puts "WARNING: You /have/ to have run npm install in #{LAMBDA_DIR} on //LINUX// for this to work. You seem to be on a different OS."
    end
    
    if not `node --version`.start_with?("v12")
        puts "WARNING: You /have/ to have run npm install in #{LAMBDA_DIR} on Node 12.0/Linux for this to work."
    end

    for directory in ["#{LAMBDA_DIR}/bin", "#{LAMBDA_DIR}/lib"]#, "#{LAMBDA_DIR}/node_modules"]
        if not File.directory? directory
            puts "Error: #{directory} is not a directory. Have you run the shell scripts in the lambda directory?"
            exit 65
        end
    end

    list = []

    functions = get_functions()

    for function in functions
        meta = YAML.load(File.read("#{function}/meta.yaml"))

        Dir.chdir("#{function}/function") do
            temp_list = []

            temp_list += Dir["*"].select { |el| el != "bin" }

            for el in meta["bin_includes"]
                temp_list << "bin/#{el}/*"
            end

            for file in temp_list
                if File.directory?(file)
                    list << "#{file}/*"
                else
                    list << file
                end
            end
        end

        archive = "lambda.zip"
        system "cd #{function}; rm -f #{archive}";
        puts r "cd #{function}/function; zip -9 -r ../#{archive} * --include #{list.map { |el| "'#{el}'" }.join(" ")}"
        puts r "cd #{function}; ls -lh #{archive}"

        deployment_size = File.size("#{function}/#{archive}")
        if deployment_size > 52428800
            puts "The deployment size is larger than 50 MB. "
            exit 65
        end

        puts r "cd #{function}; AWS_PAGER="" aws lambda update-function-code --function-name=#{name} --zip-file=fileb://#{archive}"
        if $?.exitstatus != 0
            puts "Updating #{name} failed…"
            File.delete("#{function}/#{archive}")
            exit $?.exitstatus
        end

        puts "Removing zip…"
        File.delete("#{function}/lambda.zip")
    end

else
    puts "Unknown command #{cmd}."
    exit 64
end
puts "\nDone."